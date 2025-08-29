const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// '/match' endpoint
app.post('/match', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "Missing user ID." });

  try {
    const currentUserDoc = await db.collection('users').doc(uid).get();
    if (!currentUserDoc.exists) {
      return res.status(404).json({ error: "User profile not found." });
    }
    const currentUser = currentUserDoc.data();

    const snapshot = await db.collection('users').get();
    const otherUsers = [];
    snapshot.forEach(doc => {
      if (doc.id !== uid) {
        otherUsers.push(doc.data());
      }
    });

    //complete prompt/system instruction... step by step building for AI model
    let prompt = `Suggest the best peer match for this student:\n`;

    const currentName = currentUser.name || currentUser.email;
    prompt += `[CURRENT USER] ${currentName} wants to learn "${currentUser.learnSkill}" and can teach "${currentUser.teachSkill}"\n\n`;
    prompt += `Here are other users:\n`;

    otherUsers.forEach(u => {
      const name = u.name || u.email;
      prompt += `- ${name}: can teach "${u.teachSkill}", wants to learn "${u.learnSkill}"\n`;
    });

    prompt += `\nWho would be a good match for them and why?\n`;

    //calling tge api
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ matches: text });

  } catch (err) {
    console.error('❌ Gemini Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch matches from Gemini' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
