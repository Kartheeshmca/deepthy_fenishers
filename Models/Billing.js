import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// 🧶 Line Item Schema
const itemSchema = new mongoose.Schema(
  {
    // Instead of fabricProcess reference, we'll use dcNo lookup
    dcNo: {
      type: String,
      required: true,
      trim: true,
    },

    color: { type: String, trim: true },
    fabric: { type: String, required: true, trim: true },
    process: { type: String, required: true, trim: true },
    ourDeliveryNo: { type: String, trim: true },
    lotWeight: { type: Number, min: 0 },
    rate: { type: Number, min: 0 },
    amount: {
      type: Number,
      default: function () {
        return this.lotWeight * this.rate;
      },
    },
  },
  { _id: false }
);

// ⚙️ Auto-fill fields from FabricProcess using dcNo
itemSchema.pre("save", async function (next) {
  try {
    if (this.dcNo) {
      const FabricProcess = mongoose.model("FabricProcess");
      const fp = await FabricProcess.findOne({ dcNo: this.dcNo });

      if (fp) {
        this.color = fp.color;
        this.lotWeight = fp.lotWeight;
        this.rate = fp.rate;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// 💰 Billing Schema
const billingSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String},
    date: { type: Date, default: Date.now },
    customerName: { type: String, required: true, trim: true },
    customerAddress: { type: String, required: true },
    customerPhone: { type: String },
    customerGST: { type: String },

    items: {
      type: [itemSchema],
      validate: [(arr) => arr.length > 0, "At least one item is required"],
    },

    totalAmount: { type: Number, default: 0 },

    // ✅ CGST & SGST entered by user (percentage)
    cgstPercent: { type: Number, default: 2.5 }, // user input %
    sgstPercent: { type: Number, default: 2.5 }, // user input %
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },

    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    bankName: { type: String },
    ifsc: { type: String },
    accountNo: { type: String },
    branch: { type: String },
    paymentTerms: { type: String, default: "45 Days Only" },
    note: { type: String },

    // 🕒 Download History
    downloadHistory: [
      {
        userId: { type: ObjectId, ref: "User", required: true },
        downloadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// 🧮 Auto-calculate totals
billingSchema.pre("save", function (next) {
  try {
    // Step 1: Calculate total amount from items
    this.totalAmount = this.items.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );

    // Step 2: Calculate GST amounts based on user-provided percentages
    const cgstRate = (this.cgstPercent || 0) / 100;
    const sgstRate = (this.sgstPercent || 0) / 100;

    this.cgstAmount = +(this.totalAmount * cgstRate).toFixed(2);
    this.sgstAmount = +(this.totalAmount * sgstRate).toFixed(2);

    // Step 3: Calculate grand total
    const gross = this.totalAmount + this.cgstAmount + this.sgstAmount;
    const rounded = Math.round(gross);
    this.roundOff = +(rounded - gross).toFixed(2);
    this.grandTotal = rounded;

    // Step 4: Auto-generate invoice number if not provided
    if (!this.invoiceNo) {
      const randomNum = Math.floor(Math.random() * 9000) + 1000;
      this.invoiceNo = `INV-${new Date().getFullYear()}-${randomNum}`;
    }

    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("Billing", billingSchema); 
