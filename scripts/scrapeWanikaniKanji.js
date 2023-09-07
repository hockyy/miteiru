const axios = require('axios');
const fs = require('fs');
const path = require('path');

let defaultHeaders = {
  'Wanikani-Revision': '20170710',
  'Authorization': ''
};

const baseUrl = 'https://api.wanikani.com/v2/subjects?types=';

let radicalJson = {};
let kanjiJson = {};

async function fetchData(apiUrl, headers) {
  let allData = [];
  let nextPageUrl = apiUrl;
  let pageCount = 0;

  while (nextPageUrl) {
    const response = await axios.get(nextPageUrl, {headers});
    const json = response.data;

    allData.push(...json.data);

    nextPageUrl = json.pages.next_url;
    pageCount += 1;

    console.log(
        `Fetched page ${pageCount}, total items so far: ${allData.length}`);
  }

  return allData;
}

async function downloadImage(url, destination) {
  try {
    // Check if the image already exists
    if (fs.existsSync(destination)) {
      console.log(`File already exists. Skipping download for: ${path.basename(
          destination)}`);
      return;
    }
    const response = await axios.get(url, {responseType: 'arraybuffer'});
    const buffer = Buffer.from(response.data, 'binary');
    fs.writeFileSync(destination, buffer);
  } catch (error) {
    console.error(`Failed to download image. Error: ${error}`);
  }
}

async function fetchRadicals() {
  try {
    const tmpRes = await fetchData(`${baseUrl}radical`, defaultHeaders);

    let totalProcessed = 0;

    const totalRadicals = tmpRes.length;
    console.log(`Total Radicals to process: ${totalRadicals}`);
    const characterMap = {};
    for (const radical of tmpRes) {
      const slug = radical.data.slug;
      radicalJson[radical.id] = slug;
      const characterImages = radical.data.character_images
          ? radical.data.character_images
          : [];
      characterMap[slug] = {
        character: radical.data.characters,
        meaning: radical.data.meanings.filter(
            meaning => meaning.primary)[0].meaning
      };

      let imageFound = false;

      for (const image of characterImages) {
        if (radical.data.characters) {
          break;
        }
        const {metadata} = image;

        if (
            metadata.color === '#000000' &&
            (metadata.dimensions === '128x128' ||
                metadata.dimensions === '128x128') &&
            image.content_type === "image/png"
        ) {
          imageFound = true;
          const destPath = `./renderer/public/wanikani/radical/${slug}.png`;
          console.log(`Downloading ${slug}`)
          await downloadImage(image.url, destPath);
          break;
        }
      }
      if (/\s/.test(slug)) {
        console.warn(`Warning: Slug name contains a space - ${slug}`);
      }
      if (!imageFound && !radical.data.characters) {
        console.warn(
            `Warning: No image and/or characters found for radical: ${slug}`);
      }

      // Update and show progress
      totalProcessed++;
      if (totalProcessed % 50 === 0) {
        console.log(
            `Processed ${totalProcessed}/${totalRadicals}`);
      }

    }
    fs.writeFileSync("./renderer/public/wanikani/radical.json",
        JSON.stringify(characterMap));

  } catch (error) {
    console.error(`Failed to fetch radicals. Error: ${error}`);
  }
}

async function fetchKanji() {
  try {
    kanjiJson = await fetchData(`${baseUrl}kanji`, defaultHeaders);
    const resultMap = {};
    kanjiJson.forEach((entry, index) => {
      const character = entry.data.characters;
      resultMap[character] = {
        component_subject_ids: entry.data.component_subject_ids.map(id => {
          return radicalJson[id];
        }),
        meaning_mnemonic: entry.data.meaning_mnemonic
      };

      if (index % 100 === 0) {
        console.log(`Parsed ${index + 1}/${kanjiJson.length} kanji`);
      }
    });

    fs.writeFileSync("./renderer/public/wanikani/kanji.json",
        JSON.stringify(resultMap));
    console.log(`Parsing complete! Total kanji parsed: ${kanjiJson.length}`);
  } catch (error) {
    console.error(`Failed to fetch kanji. Error: ${error}`);
  }
}

async function main() {
  const apiKey = process.argv[2];
  if (!apiKey) {
    console.error("Please provide an API key as an argument.");
    process.exit(1);
  }

  defaultHeaders['Authorization'] = `Bearer ${apiKey}`;

  await fetchRadicals();

  await fetchKanji();
}

main().catch(err => console.error(err));
