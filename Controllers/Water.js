export const calculateWaterCost = async (req, res) => {
  try {
    const { id } = req.body;
    const userName = req.user?.name || "Unknown User";

    const water = await Water.findById(id);
    if (!water)
      return res.status(404).json({ message: "Water process not found" });

    const customer = await CustomerDetails.findOne({
      receiverNo: water.receiverNo
    });

    if (!customer)
      return res.status(404).json({ message: "Customer details not found" });

    const weight = customer.weight || 1;
    const units =
      (water.closingReading || 0) - (water.openingReading || 0);

    let cost = Number(((units / weight) * 0.4).toFixed(2));

    // 🔥 FIX: Never allow negative cost
    if (isNaN(cost) || cost < 0) cost = 0;

    water.totalWaterCost = cost;

    addWaterHistory(
      water,
      "Water Cost Calculated",
      { totalWaterCost: water.totalWaterCost },
      userName
    );

    await water.save();

    return res.status(200).json({
      message: "Water cost calculated",
      water,
      runningTime: water.runningTime.toFixed(2) + " minutes"
    });

  } catch (error) {
    console.error("Cost Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
