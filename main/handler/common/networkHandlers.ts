import {ipcMain} from "electron";

const githubHeaders = (token: string) => ({
  "Accept": "application/vnd.github.v3+json",
  ...(token ? {"Authorization": `token ${token}`} : {})
});

/** Calls the GitHub REST API and returns the JSON body; failures throw with GitHub's message. */
const githubJson = async (url: string, token: string, init: RequestInit = {}) => {
  const response = await fetch(url, {...init, headers: {...githubHeaders(token), ...(init.headers ?? {})}});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? `GitHub request failed (${response.status})`);
  return body;
};

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
      const gist = await githubJson("https://api.github.com/gists", token, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          files: {[filename]: {content}},
          description,
          public: isPublic
        })
      });

      return {
        success: true,
        gistUrl: gist.html_url,
        gistId: gist.id
      };
    } catch (error) {
      console.error("Error creating GitHub Gist:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("loadGitHubGists", async (event, username: string, token: string, perPage: number = 30, page: number = 1) => {
    try {
      // /users/{username}/gists lists public gists only; the token's own /gists includes secret ones.
      const url = token ? "https://api.github.com/gists" : `https://api.github.com/users/${username}/gists`;
      const query = new URLSearchParams({per_page: String(perPage), page: String(page)});
      const list = await githubJson(`${url}?${query}`, token);

      const gists = list.map(gist => ({
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
        error: error.message
      };
    }
  });

  ipcMain.handle("getGitHubGistContent", async (event, gistId: string, token: string) => {
    try {
      const data = await githubJson(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, token);

      const gist = {
        id: data.id,
        description: data.description,
        created_at: data.created_at,
        updated_at: data.updated_at,
        files: Object.keys(data.files).map(filename => ({
          filename: filename,
          language: data.files[filename].language,
          content: data.files[filename].content,
          raw_url: data.files[filename].raw_url
        })),
        html_url: data.html_url
      };

      return {
        success: true,
        gist: gist
      };
    } catch (error) {
      console.error("Error getting GitHub Gist content:", error);
      return {
        success: false,
        error: error.message
      };
    }
  });
}
