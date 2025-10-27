const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

/**
 * Searches Wikipedia for the best matching article title.
 * @param {string} searchTerm The user's query.
 * @returns {Promise<string | null>} The article title, or null if not found.
 */
async function searchWikipedia(searchTerm) {
    const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchTerm, 
        format: 'json',
        srlimit: 1, // Only need the top result
        // We do not need 'origin: *' here because this is running server-side (Node.js)
    });

    try {
        const searchResponse = await fetch(`${WIKIPEDIA_API_URL}?${searchParams.toString()}`);
        const searchResult = await searchResponse.json();
        // Return the title of the first search result
        return searchResult.query?.search?.[0]?.title || null;
    } catch (e) {
        console.error("Wikipedia search failed:", e);
        return null;
    }
}

/**
 * Fetches and formats the summary from a Wikipedia article title.
 * @param {string} title The exact title of the Wikipedia article.
 * @returns {Promise<string | null>} The formatted HTML summary, or null if failed.
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

        // Clean up the extract (remove excess newlines) and get the first main paragraph
        let cleanedExtract = extract.split('\n').filter(p => p.trim() !== '')[0]; 
        
        // Format the final response with a link (using simple markdown/text for the backend output)
        const sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
        
        // The frontend will render this as HTML
        let htmlContent = `<p class="font-bold text-sm">Wikipedia Result for "${title}"</p>`;
        // Replace newlines with <br> for proper rendering in the HTML frontend
        htmlContent += `<p class="mt-2">${cleanedExtract.replace(/\n/g, '<br>')}</p>`;
        htmlContent += `<p class="mt-3 text-xs italic text-blue-700">Source: <a href="${sourceUrl}" target="_blank" class="underline hover:text-blue-900">${sourceUrl}</a></p>`;
        
        return htmlContent;

    } catch (e) {
        console.error("Wikipedia summary fetch failed:", e);
        return null;
    }
}


// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed" }),
        };
    }

    try {
        const { prompt } = JSON.parse(event.body);

        if (!prompt) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing required 'prompt' in the request body." }),
            };
        }
        
        // 1. Search for the article title
        const title = await searchWikipedia(prompt);
        
        let generatedText;
        if (!title) {
            // No article found
            generatedText = `Disclaimer: I am a fact-finding assistant. I could not find a relevant Wikipedia article for **"${prompt}"**. Please try a more specific health term.`;
        } else {
            // 2. Fetch the summary
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
