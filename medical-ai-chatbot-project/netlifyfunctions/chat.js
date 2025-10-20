/**
 * Secure Backend Proxy for Groq API
 * This file runs as a serverless function on Netlify to securely proxy the Groq API key.
 * * NOTE: Netlify Lambda functions export an asynchronous handler function.
 */

// Use the environment variable set in Netlify for security
const API_KEY = "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";
const GROQ_MODEL = "mixtral-8x7b-32768";

if (!API_KEY) {
    console.error("GROQ_API_KEY environment variable is not set!");
}

/**
 * Netlify Lambda function handler.
 * @param {object} event - The Netlify event object containing request details.
 * @returns {Promise<object>} The response object for the client.
 */
exports.handler = async (event) => {
    // Set CORS headers for security and browser compatibility
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
    
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }
    
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method Not Allowed' })
        };
    }

    if (!API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Server Configuration Error: API key is missing.' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Invalid JSON body.' })
        };
    }

    const { prompt, systemInstruction } = body;

    if (!prompt) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Missing required field: prompt.' })
        };
    }

    const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    const payload = {
        model: GROQ_MODEL,
        messages: [
            // Ensure systemInstruction is handled gracefully
            { role: "system", content: (systemInstruction?.parts?.[0]?.text) || "You are a helpful assistant." },
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
            const errorBody = await apiResponse.json().catch(() => ({}));
            // Groq API usually returns 401 for invalid keys
            const detailMessage = errorBody.error?.message || `Groq returned status ${apiResponse.status}.`;
            
            return {
                statusCode: apiResponse.status,
                headers,
                body: JSON.stringify({ 
                    message: 'Groq API Error', 
                    details: detailMessage 
                })
            };
        }

        const result = await apiResponse.json();
        const text = result.choices?.[0]?.message?.content;

        if (text) {
            // Send back the generated text to the frontend
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ text: text })
            };
        } else {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'Groq response was empty or malformed.' })
            };
        }

    } catch (error) {
        console.error('Backend Groq API Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: `Internal Server Error: ${error.message}` })
        };
    }
};
