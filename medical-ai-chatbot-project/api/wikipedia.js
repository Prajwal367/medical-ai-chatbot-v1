/**
 * Vercel Serverless Function: /api/wikipedia
 * This function securely fetches a health summary from the free and public Wikipedia API.
 * This requires NO API key and NO billing setup.
 */

// This is the Wikipedia API endpoint for searching and fetching summaries
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

// Exponential backoff parameters
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second

/**
 * Executes a Wikipedia search and returns the top article title.
 * @param {string} searchTerm The term to search for.
 * @returns {Promise<string|null>} The article title or null if none found.
 */
async function searchWikipedia(searchTerm) {
    const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchTerm, 
        format: 'json',
        srlimit: 1 // Only need the top result
    });

    try {
        const searchResponse = await fetch(`${WIKIPEDIA_API_URL}?${searchParams.toString()}`, { method: 'GET' });
        const searchResult = await searchResponse.json();
        return searchResult.query?.search?.[0]?.title || null;
    } catch (e) {
        console.error("Wikipedia Search Failed:", e);
        throw new Error("Search failed due to network issue.");
    }
}


// Function to handle the search and fetch with retries
async function fetchWikipediaSummary(topic) {
    let title = null;
    
    // --- NEW TWO-STEP SEARCH STRATEGY ---
    
    // 1. Attempt to find the exact, primary article title first (e.g., search "Fever" to get "Fever")
    try {
        title = await searchWikipedia(topic);
    } catch (e) {
        return { error: e.message };
    }

    // 2. If no title found in step 1, use the augmented medical keywords as a fallback
    if (!title) {
        const augmentedTopic = `${topic} medical condition OR human disease`;
        try {
            title = await searchWikipedia(augmentedTopic);
        } catch (e) {
            return { error: e.message };
        }
    }
    
    // --- END NEW SEARCH STRATEGY ---

    if (!title) {
        return { error: "No matching Wikipedia article found." };
    }

    // 2. Fetch the summary (extract) of the best matching page
    const extractParams = new URLSearchParams({
        action: 'query',
        titles: title,
        prop: 'extracts',
        exchars: 1000, // Get up to 1000 characters of the summary
        explaintext: 1, // Get plain text (no HTML)
        format: 'json',
        redirects: 1 // Follow redirects
    });

    let extractResult;
    try {
        const extractResponse = await fetch(`${WIKIPEDIA_API_URL}?${extractParams.toString()}`, { method: 'GET' });
        extractResult = await extractResponse.json();
    } catch (e) {
        console.error("Wikipedia Extract Failed:", e);
        return { error: "Extraction failed due to network issue." };
    }

    const pages = extractResult.query?.pages;
    const pageId = Object.keys(pages)[0];
    const extract = pages[pageId]?.extract;

    if (!extract) {
        return { error: "Could not extract summary." };
    }

    // 3. Clean up the extract and create the source URL
    // We also remove any "may refer to" sentences that show up in disambiguation pages
    let cleanedExtract = extract.split('\n')[0]; 
    if (cleanedExtract.includes("may refer to:")) {
        cleanedExtract = "The topic is ambiguous, but here is the primary medical summary:";
    }

    const sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

    return {
        title: title,
        summary: cleanedExtract,
        sourceUrl: sourceUrl
    };
}


// Vercel function handler
module.exports = async (req, res) => {
    // CORS headers for security and browser compatibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ message: 'Missing required field: prompt' });
        }

        // Call the Wikipedia fetching function with retries
        let result = await fetchWikipediaSummary(prompt);
        
        // Handle internal finding errors from the fetcher
        if (result.error) {
             return res.status(200).json({ error: result.error });
        }


        // Success response
        res.status(200).json(result);

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ message: 'Internal server error processing Wikipedia request.' });
    }
};
