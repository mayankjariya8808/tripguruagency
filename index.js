require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 5000;


const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/tripDB";

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Connect to MongoDB
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Define Mongoose Schema & Model
const bookingSchema = new mongoose.Schema({
  email: { type: String, required: true },
  contact: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  date: String,
  startDate: String,
  endDate: String,
  passenger: { type: Number, required: true },
  tripType: { type: String, enum: ["oneway", "roundtrip"], required: true },
  paymentAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

// Trip Booking
app.post("/book", async (req, res) => {
  try {
    const { email, contact, from, to, date, startDate, endDate, passenger, tripType } = req.body;

    if (!email || !contact || !from || !to || !passenger || !tripType) {
      return res.status(400).json({ error: "❌ Missing required fields" });
    }

    const newBooking = new Booking({
      email,
      contact,
      from,
      to,
      date: tripType === "oneway" ? date : null,
      startDate: tripType === "roundtrip" ? startDate : null,
      endDate: tripType === "roundtrip" ? endDate : null,
      passenger,
      tripType
    });

    await newBooking.save();
    res.status(201).json({ message: "🎉 Booking successful!", booking: newBooking });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get All Bookings
app.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete a Booking
app.delete("/booking/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBooking = await Booking.findByIdAndDelete(id);

    if (!deletedBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.status(200).json({ message: "🗑️ Booking deleted successfully", deletedBooking });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update Booking
app.put("/booking/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedBooking = await Booking.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

    if (!updatedBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.status(200).json({ message: "✏️ Booking updated successfully", updatedBooking });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update Payment Details
app.put("/booking/payment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentAmount, paymentStatus } = req.body;

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { paymentAmount, paymentStatus },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.status(200).json({ message: "💰 Payment updated successfully", updatedBooking });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Generate Invoice Image
app.post("/generate-invoice", async (req, res) => {
  try {
    const { contactNo, customerName, from, to, date, amount } = req.body;
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    let htmlContent = fs.readFileSync("bill.html", "utf8");
    htmlContent = htmlContent.replace("John Doe", customerName).replace("City A", from).replace("City B", to).replace("01/01/2024", date).replace("1000", amount);
    await page.setContent(htmlContent);
    const filePath = `public/invoice-${Date.now()}.png`;
    await page.screenshot({ path: filePath, fullPage: true });
    await browser.close();
    const imageUrl = `http://127.0.0.1:5500/${filePath}`;
    const message = `Hello, here is your trip booking invoice:\n\nFrom: ${from}\nTo: ${to}\nDate: ${date}\nAmount: ₹${amount}\nInvoice: ${imageUrl}`;
    const whatsappURL = `https://wa.me/${contactNo}?text=${encodeURIComponent(message)}`;
    res.json({ success: true, imageUrl, whatsappURL });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/bookings/invoice/:id", async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }
        res.json(booking);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});


// Handle 404 Errors
app.use((req, res) => {
  res.status(404).json({ error: "❌ Route not found" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
