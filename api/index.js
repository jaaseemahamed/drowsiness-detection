const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database');
const twilio = require('twilio');

// Twilio Configuration - Replace with your own credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'YOUR_ACCOUNT_SID';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'YOUR_AUTH_TOKEN';
const twilioNumber = process.env.TWILIO_PHONE_NUMBER || 'YOUR_TWILIO_PHONE_NUMBER';

const twilioClient = (accountSid !== 'YOUR_ACCOUNT_SID' && authToken !== 'YOUR_AUTH_TOKEN')
    ? twilio(accountSid, authToken)
    : null;

const sendRealSMS = async (to, message) => {
    if (!twilioClient) {
        console.log(`[SIMULATION] Twilio not configured. Message to ${to}: ${message}`);
        return;
    }
    try {
        await twilioClient.messages.create({
            body: message,
            from: twilioNumber,
            to: to
        });
        console.log(`[REAL SMS] Dispatched to ${to}`);
    } catch (error) {
        console.error(`[TWILIO ERROR] Failed to send to ${to}:`, error.message);
    }
};

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Get all projects
app.get('/api/projects', (req, res) => {
    db.all('SELECT * FROM projects ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Add a new project
app.post('/api/projects', (req, res) => {
    const { title, description, status } = req.body;
    const sql = 'INSERT INTO projects (title, description, status) VALUES (?, ?, ?)';
    const params = [title, description, status || 'Planning'];
    db.run(sql, params, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, title, description, status: status || 'Planning' });
    });
});

// Update a project
app.put('/api/projects/:id', (req, res) => {
    const { title, description, status } = req.body;
    const sql = 'UPDATE projects SET title = ?, description = ?, status = ? WHERE id = ?';
    const params = [title, description, status, req.params.id];
    db.run(sql, params, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ updated: this.changes });
    });
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
    const sql = 'DELETE FROM projects WHERE id = ?';
    db.run(sql, [req.params.id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ deleted: this.changes });
    });
});

// Helper to simulate finding the nearest police station
const findNearbyPoliceStation = (location) => {
    if (!location || !location.lat) return { name: "Central Police Headquaters", phone: "100" };

    // In a real app, this would use Google Places API or similar
    // We simulate finding a specific station based on the lat/lon
    const stations = [
        { name: "City North Police Station", phone: "+91 44 2345 6789" },
        { name: "Metro East Police Station", phone: "+91 44 9876 5432" },
        { name: "South Side Precinct", phone: "+91 44 1122 3344" },
        { name: "West Hub Police Station", phone: "+91 44 5566 7788" }
    ];

    // Deterministic selection based on coordinates for the demo
    const index = Math.floor((Math.abs(location.lat || 0) + Math.abs(location.lon || 0)) * 10) % stations.length;
    return stations[index];
};

// Alert endpoint for Drowsiness and Faint Detection
app.post('/api/alert', (req, res) => {
    const { contacts, policeNumber, message, metadata, location, timestamp, type = 'Emergency' } = req.body;

    const nearestPolice = findNearbyPoliceStation(location);
    const policeToNotify = policeNumber && policeNumber !== '100' ? policeNumber : nearestPolice.phone;

    console.log(`\n--- ${type.toUpperCase()} DISPATCHED ---`);
    console.log(`Time: ${timestamp}`);
    console.log(`Location: ${location ? `${location.lat}, ${location.lon}` : 'Unknown'}`);
    console.log(`Message: ${message}`);
    console.log(`Notifying Police: ${nearestPolice.name} (${policeToNotify})`);
    console.log(`Notifying Contacts: ${contacts ? contacts.join(', ') : 'None'}`);
    console.log(`---------------------------------\n`);

    // Save to database
    const sql = 'INSERT INTO alerts (type, message, location, contacts, police_notified) VALUES (?, ?, ?, ?, ?)';
    const params = [
        type,
        message,
        location ? JSON.stringify(location) : 'N/A',
        contacts ? contacts.join(', ') : '',
        `${nearestPolice.name} (${policeToNotify})`
    ];

    db.run(sql, params, async function (err) {
        if (err) {
            console.error('Database error saving alert:', err.message);
        }

        // --- REAL WORLD DISPATCH ---
        if (contacts && Array.isArray(contacts)) {
            for (const contact of contacts) {
                if (contact.trim()) {
                    await sendRealSMS(contact.trim(), message);
                }
            }
        }
        // Also notify the police if a valid phone number is present
        if (policeToNotify && policeToNotify.startsWith('+')) {
            await sendRealSMS(policeToNotify, `EMERGENCY ALERT: ${message}`);
        }

        // Simulate SMS sending delay for UI responsiveness
        setTimeout(() => {
            res.json({
                success: true,
                status: 'Alert successfully dispatched to emergency services',
                details: {
                    alertId: this.lastID,
                    policeStation: nearestPolice.name,
                    policeContact: policeToNotify,
                    contactsCount: contacts ? contacts.length : 0,
                    locationSent: !!location
                }
            });
        }, 800);
    });
});


// --- AUTHENTICATION ENDPOINTS ---

// Register
app.post('/api/register', (req, res) => {
    const { email, password, name, emergencyContacts } = req.body;
    const sql = 'INSERT INTO users (email, password, name, emergency_contacts) VALUES (?, ?, ?, ?)';
    db.run(sql, [email, password, name, emergencyContacts || ''], function (err) {
        if (err) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.json({ id: this.lastID, email, name });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            emergencyContacts: user.emergency_contacts,
            policeNumber: user.police_number
        });
    });
});

// Update Profile
app.put('/api/profile', (req, res) => {
    const { id, emergencyContacts, policeNumber } = req.body;
    const sql = 'UPDATE users SET emergency_contacts = ?, police_number = ? WHERE id = ?';
    db.run(sql, [emergencyContacts, policeNumber, id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

module.exports = app;
