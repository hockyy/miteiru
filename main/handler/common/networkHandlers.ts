import {ipcMain} from "electron";
import axios from "axios";

async function translateHandler(text, lang) {
  const targetLang = "en";
  const url = "https://translate.googleapis.com/translate_a/single";

  const params = new URLSearchParams({
    client: "gtx",
    sl: lang,
    tl: targetLang,
    dt: "t",
    q: text
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  };

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Translation request failed with status code: ${response.status}`);
    }

    const data = await response.json();
    return data[0].map(sentence => sentence[0]).join("");
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
}

export function registerNetworkHandlers() {
  ipcMain.handle("gtrans", async (event, text, lang) => {
    try {
      const result = await translateHandler(text, lang);
      return {
        success: true,
        translatedText: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("createGitHubGist", async (event, filename: string, content: string, description: string, isPublic: boolean, token: string) => {
    try {
      const response = await axios.post("https://api.github.com/gists", {
        files: {
          [filename]: {
            content: content
          }
        },
        description: description,
        public: isPublic
      }, {
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json"
        }
      });

      return {
        success: true,
        gistUrl: response.data.html_url,
        gistId: response.data.id
      };
    } catch (error) {
      console.error("Error creating GitHub Gist:", error);
      return {
        success: false,
        error: error.response ? error.response.data.message : error.message
      };
    }
  });

  ipcMain.handle("loadGitHubGists", async (event, username: string, token: string, perPage: number = 30, page: number = 1) => {
    try {
      const response = await axios.get(`https://api.github.com/users/${username}/gists`, {
        params: {
          per_page: perPage,
          page: page
        },
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${token}`
        }
      });

      const gists = response.data.map(gist => ({
        id: gist.id,
        description: gist.description,
        created_at: gist.created_at,
        updated_at: gist.updated_at,
        files: Object.keys(gist.files).map(filename => ({
          filename: filename,
          language: gist.files[filename].language,
          raw_url: gist.files[filename].raw_url
        })),
        html_url: gist.html_url
      }));

      return {
        success: true,
        gists: gists
      };
    } catch (error) {
      console.error("Error loading GitHub Gists:", error);
      return {
        success: false,
        error: error.response ? error.response.data.message : error.message
      };
    }
  });

  ipcMain.handle("getGitHubGistContent", async (event, gistId: string, token: string) => {
    try {
      const response = await axios.get(`https://api.github.com/gists/${gistId}`, {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${token}`
        }
      });

      const gist = {
        id: response.data.id,
        description: response.data.description,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        files: Object.keys(response.data.files).map(filename => ({
          filename: filename,
          language: response.data.files[filename].language,
          content: response.data.files[filename].content,
          raw_url: response.data.files[filename].raw_url
        })),
        html_url: response.data.html_url
      };

      return {
        success: true,
        gist: gist
      };
    } catch (error) {
      console.error("Error getting GitHub Gist content:", error);
      return {
        success: false,
        error: error.response ? error.response.data.message : error.message
      };
    }
  });
}
