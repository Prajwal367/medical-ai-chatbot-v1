/**
 * Secure Backend Proxy for Groq API
 * This file runs as a serverless function (on Netlify/Vercel) to hide the Groq API key.
 *
 * NOTE: For Vercel/Netlify, this file must be inside an 'api' folder and must export a handler function.
 */

// Use the environment variable set in Vercel/Netlify for security
const API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = "mixtral-8x7b-32768";

if (!API_KEY) {
    console.error("GROQ_API_KEY environment variable is not set!");
}

/**
 * Handles incoming chat requests and proxies them securely to the Groq API.
 * @param {object} req - The Vercel/Node.js request object.
 * @param {object} res - The Vercel/Node.js response object.
 */
module.exports = async (req, res) => {
    // Set CORS headers to allow communication from the frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { prompt, systemInstruction } = req.body;

    if (!prompt) {
        return res.status(400).json({ message: 'Missing required field: prompt.' });
    }

    const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    const payload = {
        model: GROQ_MODEL,
        messages: [
            // Ensure systemInstruction is handled gracefully if the parts structure isn't exactly as expected
            { role: "system", content: (systemInstruction && systemInstruction.parts && systemInstruction.parts[0] && systemInstruction.parts[0].text) || "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        stream: false,
    };

    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.json();
            return res.status(apiResponse.status).json({ message: 'Groq API Error', details: errorBody });
        }

        const result = await apiResponse.json();
        const text = result.choices?.[0]?.message?.content;

        if (text) {
            // Send back the generated text to the frontend
            return res.status(200).json({ text: text });
        } else {
            return res.status(500).json({ message: 'Groq response was empty or malformed.' });
        }

    } catch (error) {
        console.error('Backend Groq API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error during AI call.' });
    }
};
