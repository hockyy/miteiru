const axios = require('axios');
const fs = require('fs');

async function fetchKanjiData(apiUrl, apiKey) {
    const headers = {
        "Wanikani-Revision": "20170710",
        "Authorization": `Bearer ${apiKey}`
    };

    let allData = [];
    let nextPageUrl = apiUrl;
    let pageCount = 0;

    while (nextPageUrl) {
        const response = await axios.get(nextPageUrl, { headers });
        const json = response.data;

        allData.push(...json.data);

        nextPageUrl = json.pages.next_url;

        pageCount += 1;
        console.log(`Fetched page ${pageCount}, total kanji so far: ${allData.length}`);
    }

    return allData;
}

async function main() {
    const apiKey = process.argv[2];
    if (!apiKey) {
        console.error("Please provide an API key as an argument.");
        console.log("\nExample:");
        console.log("npm run script:updkanji -- xxxxxxxx-xxxx-xxxx-xxxx-113a051c6298");
        process.exit(1);
    }

    const apiUrl = "https://api.wanikani.com/v2/subjects?types=kanji";
    const allData = await fetchKanjiData(apiUrl, apiKey);

    let resultMap = {};

    allData.forEach((entry, index) => {
        const character = entry.data.characters;
        resultMap[character] = {
            component_subject_ids: entry.data.component_subject_ids,
            amalgamation_subject_ids: entry.data.amalgamation_subject_ids,
            visually_similar_subject_ids: entry.data.visually_similar_subject_ids,
            meaning_mnemonic: entry.data.meaning_mnemonic
        };

        if (index % 100 === 0) {
            console.log(`Parsed ${index + 1}/${allData.length} kanji`);
        }
    });

    fs.writeFileSync("./renderer/public/wanikani/kanji.json", JSON.stringify(resultMap));
    console.log(`Parsing complete! Total kanji parsed: ${allData.length}`);
}

main().catch(err => console.error(err));
