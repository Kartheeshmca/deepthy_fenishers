import listProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";

/* ============================================================================
// CREATE FABRIC PROCESS (ASSIGN WORK)
============================================================================ */
export const createFabricProcess = async (req, res) => {
  try {
    const { receiverNo, qty, machineNo, rate, shiftIncharge, operator, date } = req.body;

    // 1. Validate customer exists
    const customer = await CustomerDetails.findOne({ receiverNo });
    if (!customer)
      return res.status(404).json({ success: false, message: "Receiver No not found in Customer Details" });

    // 2. Validate operator exists
    const operatorUser = await User.findOne({ name: { $regex: new RegExp(`^${operator}$`, "i") } });
    if (!operatorUser)
      return res.status(404).json({ success: false, message: "Operator not found" });

    // 3. Check if receiverNo is already assigned and pending/running
    const existingProcess = await listProcess.findOne({
      receiverNo,
      status: { $in: ["Pending", "Running"] }
    });
    if (existingProcess)
      return res.status(400).json({
        success: false,
        message: `Receiver No ${receiverNo} is already assigned and in ${existingProcess.status} status`
      });

    // 4. Create Fabric Process
    const status = "Pending";
    const totalCost = qty * rate;
    const processEntry = await listProcess.create({
      receiverNo,
      customer: customer._id,
      date,
      qty,
      machineNo,
      rate,
      totalCost,
      shiftIncharge,
      operator,
      status,
      cycle: 1,
      history: [
        {
          action: "Process Created",
          changes: { status, receiverNo, operator },
          user: req.user?.name || "System",
          date: new Date()
        }
      ]
    });

    // 5. Assign fabric to operator (update assignedFabrics)
    await User.findByIdAndUpdate(operatorUser._id, {
      $push: {
        assignedFabrics: {
          fabricProcess: processEntry._id,
          receiverNo: processEntry.receiverNo,
          status: processEntry.status,
          startTime: null,
          endTime: null
        }
      }
    });

    // 6. Populate response
    const result = await listProcess.findById(processEntry._id).populate("customer").lean();

    return res.status(201).json({
      success: true,
      message: "Fabric process created and assigned to operator successfully",
      data: result
    });

  } catch (error) {
    console.error("Error creating fabric process:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
/* ============================================================================
   RE-PROCESS FABRIC (CREATE NEW ENTRY WITH UPDATED RECEIVER NO)
============================================================================ */
export const reProcessFabric = async (req, res) => {
  try {
    const { receiverNo } = req.params;
    const userName = req.user?.name || "System";

    // 1. Find latest entry
    const previous = await listProcess.findOne({ receiverNo }).sort({ createdAt: -1 });
    if (!previous) {
      return res.status(404).json({ success: false, message: "Receiver No not found for re-process" });
    }

    // 2. Only allow Re-Process if previous is Completed / Running / Paused
    if (previous.status === "Pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot Re-Process. The process is still in Pending state."
      });
    }

    // 3. Calculate new cycle and new receiver format
    const newCycle = previous.cycle + 1;
    const newReceiverNo = `RE-${receiverNo}-${newCycle}`;

    // 4. Update OLD entry → mark Pending and add history
    await listProcess.findByIdAndUpdate(previous._id, {
      status: "Pending",
      $push: {
        history: {
          action: "Re-Processed (Old entry marked Pending)",
          changes: {
            oldReceiver: receiverNo,
            oldStatus: previous.status,
            newStatus: "Pending",
            cycle: previous.cycle
          },
          user: userName
        }
      }
    });

    // 5. Remove old assignment from operator
    await User.updateOne(
      { name: previous.operator },
      { $pull: { assignedFabrics: { fabricProcess: previous._id } } }
    );

    // 6. Create NEW entry (new cycle)
    const newProcess = await listProcess.create({
      receiverNo: newReceiverNo,
      customer: previous.customer,
      date: new Date(),
      qty: previous.qty,
      machineNo: previous.machineNo,
      rate: previous.rate,
      totalCost: previous.qty * previous.rate,
      shiftIncharge: previous.shiftIncharge,
      operator: previous.operator,
      cycle: newCycle,
      dyes: [],
      chemicals: [],
      status: "Pending",
      history: [
        {
          action: "Re-Processed (New Cycle Started)",
          changes: { from: receiverNo, to: newReceiverNo, cycle: newCycle },
          user: userName
        }
      ]
    });

    // 7. Add new assignment to operator
    await User.updateOne(
      { name: previous.operator },
      {
        $push: {
          assignedFabrics: {
            fabricProcess: newProcess._id,
            receiverNo: newReceiverNo,
            status: "Pending",
            startTime: null,
            endTime: null
          }
        }
      }
    );

    // 8. Populate and send response
    const result = await listProcess.findById(newProcess._id).populate("customer").lean();
    return res.status(201).json({
      success: true,
      message: "Fabric Re-Processed and assigned to operator successfully",
      data: result
    });

  } catch (error) {
    console.error("Error re-processing fabric:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

export const getAllFabricProcesses = async (req, res) => {
  try {
    const list = await listProcess
      .find()
      .populate("customer")
      .sort({ createdAt: -1 })  // latest first
      .lean();

    return res.status(200).json({
      success: true,
      count: list.length,
      data: list
    });

  } catch (error) {
    console.log("Error fetching process list:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

/* ============================================================================
   GET ONLY PENDING FABRIC PROCESS LIST (FOR TABLE)
============================================================================ */
/* ============================================================================
   GET ONLY LATEST PENDING FABRIC PROCESS (PER RECEIVER NO)
============================================================================ */
export const getPendingFabricProcesses = async (req, res) => {
  try {
    const { machineNo, receiverNo } = req.query;

    // Build dynamic filter
    let matchFilter = { status: "Pending" };
    if (machineNo) matchFilter.machineNo = { $regex: new RegExp(machineNo, "i") };
    if (receiverNo) matchFilter.receiverNo = { $regex: new RegExp(receiverNo, "i") };

    const list = await listProcess.aggregate([
      // 1) Apply dynamic filters
      { $match: matchFilter },

      // 2) Sort by createdAt descending to pick latest per receiver
      { $sort: { createdAt: -1 } },

      // 3) Group by receiverNo → keep latest record only
      {
        $group: {
          _id: "$receiverNo",
          latestEntry: { $first: "$$ROOT" }
        }
      },

      // 4) Replace root with actual document
      { $replaceRoot: { newRoot: "$latestEntry" } },

      // 5) Lookup customer info
      {
        $lookup: {
          from: "customerdetails",
          localField: "customer",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },

      // 6) Final sort: latest machine first, latest receiver first
      { $sort: { machineNo: -1, receiverNo: -1 } }
    ]);

    return res.status(200).json({
      success: true,
      count: list.length,
      data: list
    });

  } catch (error) {
    console.log("Error fetching pending fabric list:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};
export const getOperatorAssignedFabrics = async (req, res) => {
  try {
    const operatorName = req.user?.name; // assuming req.user is set via auth middleware
    if (!operatorName) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // 1. Find operator
    const operator = await User.findOne({ name: operatorName }).lean();
    if (!operator) {
      return res.status(404).json({ success: false, message: "Operator not found" });
    }

    // 2. Get all assigned fabrics
    const assignedFabricIds = operator.assignedFabrics.map(f => f.fabricProcess);

    // 3. Fetch fabric process details
    const fabrics = await listProcess
      .find({ _id: { $in: assignedFabricIds } })
      .populate("customer") // include customer details
      .sort({ createdAt: -1 }) // latest first
      .lean();

    // 4. Merge with status from assignedFabrics
    const fabricsWithStatus = fabrics.map(fabric => {
      const assignment = operator.assignedFabrics.find(a => a.fabricProcess.toString() === fabric._id.toString());
      return {
        ...fabric,
        assignedStatus: assignment?.status || fabric.status,
        startTime: assignment?.startTime || null,
        endTime: assignment?.endTime || null
      };
    });

    return res.status(200).json({
      success: true,
      count: fabricsWithStatus.length,
      data: fabricsWithStatus
    });

  } catch (error) {
    console.error("Error fetching operator assigned fabrics:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};
