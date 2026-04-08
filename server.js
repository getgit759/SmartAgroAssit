const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { syncDB, User, Equipment, Booking } = require('./models/db');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'agroassist_pro_super_secret_key_2026';

// -----------------------------------------
// AUTHENTICATION ROUTES
// -----------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, mobile, email, password, role, location } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, mobile, email, passwordHash, role, location });
    
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, role: user.role, name: user.name });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// -----------------------------------------
// EQUIPMENT ROUTES
// -----------------------------------------
app.get('/api/equipment', async (req, res) => {
  try {
    const equipment = await Equipment.findAll({ include: [{ model: User, attributes: ['name', 'mobile'] }] });
    res.json(equipment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

app.post('/api/equipment', authMiddleware, async (req, res) => {
  if (req.user.role !== 'provider') return res.status(403).json({ error: 'Only providers can add equipment' });
  try {
    const newEq = await Equipment.create({ ...req.body, providerId: req.user.id });
    res.status(201).json(newEq);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create equipment', details: error.message });
  }
});

// -----------------------------------------
// BOOKING ROUTES
// -----------------------------------------
app.post('/api/bookings', authMiddleware, async (req, res) => {
  if (req.user.role !== 'farmer') return res.status(403).json({ error: 'Only farmers can book' });
  try {
    const { equipmentId, startDate, endDate } = req.body;
    const eq = await Equipment.findByPk(equipmentId);
    if (!eq) return res.status(404).json({ error: 'Equipment not found' });
    
    // Conflict Check (basic implementation)
    const existingBooking = await Booking.findOne({
      where: {
        equipmentId,
        status: { [require('sequelize').Op.in]: ['Requested', 'Confirmed', 'In Use'] }
      }
    });

    if (existingBooking) return res.status(400).json({ error: 'Equipment is already booked for this timeframe.' });

    // Assuming cost calculation logic
    const totalCost = eq.pricePerHour * 24; // Mock calculation
    const booking = await Booking.create({
      equipmentId,
      farmerId: req.user.id,
      startDate,
      endDate,
      totalCost
    });

    eq.status = 'Booked';
    await eq.save();

    res.status(201).json({ message: 'Booking requested successfully', booking });
  } catch (error) {
    res.status(500).json({ error: 'Booking failed', details: error.message });
  }
});

app.post('/api/bookings/cancel', authMiddleware, async (req, res) => {
  if (req.user.role !== 'farmer') return res.status(403).json({ error: 'Only farmers can cancel bookings' });
  try {
    const { equipmentId } = req.body;
    
    let dbQuery = {
      farmerId: req.user.id,
      status: { [require('sequelize').Op.in]: ['Requested', 'Confirmed'] }
    };
    if (equipmentId) {
      dbQuery.equipmentId = equipmentId;
    }

    // Find active booking for this user and equipment
    const booking = await Booking.findOne({
      where: dbQuery,
      order: [['createdAt', 'DESC']]
    });

    if (!booking) {
      return res.status(404).json({ error: 'No active booking found for this equipment under your account.' });
    }

    // Cancel booking and free up equipment
    booking.status = 'Cancelled';
    await booking.save();

    const eq = await Equipment.findByPk(booking.equipmentId);
    if (eq) {
      eq.status = 'Available';
      await eq.save();
    }

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Cancellation failed', details: error.message });
  }
});

// -----------------------------------------
// AI RECOMMENDATION & COST OPTIMIZER LOGIC
// -----------------------------------------
app.post('/api/ai/recommend', authMiddleware, async (req, res) => {
  const { cropType, landSizeAcres, season } = req.body;
  // Simple rule-based intelligent recommendation
  let recommendations = [];
  
  if (cropType.toLowerCase() === 'wheat' && season.toLowerCase() === 'harvest') {
    recommendations.push('Combine Harvester');
    recommendations.push('Heavy Duty Tractor');
  } else if (landSizeAcres > 10) {
    recommendations.push('Tractor with Cultivator');
  } else {
    recommendations.push('Mini Tractor');
  }

  // Cost optimizer mock response
  res.json({
    message: "Based on crop tracking, we recommend these tools:",
    recommendations,
    costOptimizationHint: "Book between 10 AM - 2 PM for 15% off-peak delivery discounts!"
  });
});

// -----------------------------------------
// AI CROP DOCTOR IMAGE DIAGNOSTIC API
// -----------------------------------------
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Stores in server/uploads

app.post('/api/ai/diagnose', authMiddleware, upload.single('cropImage'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image provided. Please scan a crop leaf." });

  // Simulate an expensive Machine Learning Classification Job taking 2 seconds
  setTimeout(() => {
    // We mock a randomized response for demonstration of a real working flow
    const isHealthy = Math.random() > 0.6; // 40% chance of healthy, 60% chance of disease

    if (isHealthy) {
      res.json({
        status: "good",
        diagnosis: "Healthy Crop",
        confidence: "98.4%",
        precautions: [
          "Continue current watering schedule.",
          "Ensure adequate sunlight exposure.",
          "No pesticide action required at this time."
        ]
      });
    } else {
      res.json({
        status: "bad",
        diagnosis: "Early-stage Leaf Blight / Fusarium",
        confidence: "89.2%",
        precautions: [
          "Immediate Action: Apply a Copper-based fungicide spray within 48 hours.",
          "Preventative: Reduce soil moisture by improving drainage.",
          "Quarantine: Remove and burn heavily infected leaves to stop spread."
        ]
      });
    }
  }, 2000);
});

// Sync DB and Start Server
const PORT = process.env.PORT || 5000;
syncDB().then(() => {
  app.listen(PORT, () => console.log(`AgroAssist Pro Server running on port ${PORT}`));
});
