const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

// List of non-medical keywords that should trigger a rejection if they are the sole focus.
const NON_MEDICAL_KEYWORDS = [
    "queen", "king", "president", "country", "city", "village", 
    "novel", "movie", "song", "album", "history", "art", 
    "politics", "religion", "weather", "sports", "celebrity", 
    "actor", "actress", "singer", "artist", "book", "car", "place"
];

/**
 * Checks if the prompt is a simple greeting.
 */
const isGreeting = (prompt) => {
    // Matches common greetings at the beginning of the prompt
    const greetings = /^(hi|hello|hey|greetings|hallo|what's up|how are you|how is it going)\b/i;
    return greetings.test(prompt.trim().toLowerCase());
};

/**
 * Cleans the prompt to get a precise search term.
 * E.g., "I have a fever" -> "fever"
 */
const cleanMedicalPrompt = (prompt) => {
    let cleaned = prompt.trim();
    // Remove conversational filler phrases
    cleaned = cleaned.replace(/^(i have a|i feel|what is|tell me about|what are|the benefits of|i want to know about)\s+/i, '');
    return cleaned.trim();
};

/**
 * Determines if the search term is likely non-medical.
 */
const isLikelyNonMedical = (searchTerm) => {
    const lowerTerm = searchTerm.toLowerCase();
    
    // Check if the cleaned term is just a number or very short (which often leads to bad results)
    if (lowerTerm.length < 3 || !isNaN(lowerTerm)) {
        return false; // Let the search proceed for short terms like 'flu' or 'pain'
    }

    // Check against the non-medical keywords list
    for (const keyword of NON_MEDICAL_KEYWORDS) {
        if (lowerTerm.includes(keyword)) {
            // A simple check: if the main cleaned term contains a non-medical keyword, reject it.
            // Example: 'Queen Victoria' contains 'queen' -> reject.
            return true;
        }
    }
    return false;
};


// ... [searchWikipedia and fetchWikipediaSummary functions remain the same] ...

/**
 * Searches Wikipedia for the best matching article title.
 */
async function searchWikipedia(searchTerm) {
    const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchTerm, 
        format: 'json',
        srlimit: 1, // Only need the top result
    });

    try {
        const searchResponse = await fetch(`${WIKIPEDIA_API_URL}?${searchParams.toString()}`);
        const searchResult = await searchResponse.json();
        return searchResult.query?.search?.[0]?.title || null;
    } catch (e) {
        console.error("Wikipedia search failed:", e);
        return null;
    }
}

/**
 * Fetches and formats the summary from a Wikipedia article title.
 */
async function fetchWikipediaSummary(title) {
    const extractParams = new URLSearchParams({
        action: 'query',
        titles: title,
        prop: 'extracts',
        exchars: 1200, // Get up to 1200 characters of the summary
        explaintext: 1, // Get plain text (no HTML)
        format: 'json',
        redirects: 1, // Follow redirects
    });

    try {
        const extractResponse = await fetch(`${WIKIPEDIA_API_URL}?${extractParams.toString()}`);
        const extractResult = await extractResponse.json();

        const pages = extractResult.query?.pages;
        const pageId = Object.keys(pages)[0];
        const extract = pages[pageId]?.extract;

        if (!extract) {
            return null;
        }

        let cleanedExtract = extract.split('\n').filter(p => p.trim() !== '')[0]; 
        
        const sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
        
        let htmlContent = `<p class="font-bold text-sm">Wikipedia Result for "${title}"</p>`;
        htmlContent += `<p class="mt-2">${cleanedExtract.replace(/\n/g, '<br>')}</p>`;
        htmlContent += `<p class="mt-3 text-xs italic text-blue-700">Source: <a href="${sourceUrl}" target="_blank" class="underline hover:text-blue-900">Read the full article on Wikipedia</a></p>`;
        
        return htmlContent;

    } catch (e) {
        console.error("Wikipedia summary fetch failed:", e);
        return null;
    }
}


// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: "Method Not Allowed" }) };
    }

    try {
        const { prompt } = JSON.parse(event.body);
        if (!prompt) {
            return { statusCode: 400, body: JSON.stringify({ message: "Missing required 'prompt' in the request body." }) };
        }
        
        let generatedText;

        // --- 1. Small Talk Check ---
        if (isGreeting(prompt)) {
            generatedText = "Hello there! I'm here to provide Wikipedia information on **health and medical topics** only. How can I help you find a medical fact today?";
            return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: generatedText }) };
        }

        // --- 2. Clean and Filter Query ---
        const cleanedQuery = cleanMedicalPrompt(prompt);
        
        if (isLikelyNonMedical(cleanedQuery)) {
            generatedText = `I apologize, but my function is strictly limited to **health and medical topics**. I cannot search for information about "${cleanedQuery}". Please try a health-related question instead.`;
            return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: generatedText }) };
        }
        
        // --- 3. Search and Fetch ---
        
        // Use the cleaned query for a better search result (e.g., "fever" instead of "I have a fever")
        const title = await searchWikipedia(cleanedQuery); 
        
        if (!title || title.toLowerCase() === 'wikipedia') { // "wikipedia" itself is often the first search result on non-topics
            generatedText = `Disclaimer: I am a fact-finding assistant. I could not find a relevant Wikipedia article for **"${prompt}"**. Please try a more specific health term.`;
        } else {
            const summaryHtml = await fetchWikipediaSummary(title);

            if (summaryHtml) {
                generatedText = `Disclaimer: I am a fact-finding assistant, not a doctor. ${summaryHtml}`;
            } else {
                generatedText = `Disclaimer: I am a fact-finding assistant. Found article "${title}" but could not extract a summary.`;
            }
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: generatedText }),
        };

    } catch (error) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: "Internal Server Error during Wikipedia search.",
                error: error.toString()
            }),
        };
    }
};
