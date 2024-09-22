// components/GistManager.tsx
import React, {useState, useCallback} from 'react';
import {AwesomeButton} from "react-awesome-button";
import {useStoreData} from "../../hooks/useStoreData";

interface GistManagerProps {
  lang: string;
}

export const GistManager: React.FC<GistManagerProps> = ({lang}) => {
  const [githubUsername, setGithubUsername] = useStoreData('github.username', '');
  const [githubToken, setGithubToken] = useStoreData('github.token', '');
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const saveLearningHandler = useCallback(async () => {
    if (!githubToken) {
      alert('Please enter a GitHub token first.');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Saving learning state to Gist...');
      const val = await window.ipc.invoke('loadLearningState', lang);
      const filename = `learning_state_${lang}.json`;
      const description = `Learning state for ${lang}`;
      const result = await window.ipc.invoke('createGitHubGist', filename, JSON.stringify(val), description, true, githubToken);

      if (result.success) {
        console.log('Gist created successfully!');
        alert(`Gist created successfully! URL: ${result.gistUrl}`);
        await window.electronAPI.openExternal(result.gistUrl);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error saving learning state:', error);
      alert(`Error saving learning state: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [lang, githubToken, githubUsername]);

  const loadLearningHandler = useCallback(async () => {
    if (!githubUsername) {
      alert('Please enter a GitHub username first.');
      return;
    }

    if (!githubToken) {
      alert('Please enter a GitHub token first.');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Loading learning state from Gist...');
      const result = await window.ipc.invoke('loadGitHubGists', githubUsername, githubToken);

      if (!result.success) {
        throw new Error(result.error);
      }

      const learningStateGist = result.gists.find((gist: any) =>
          gist.description.includes(`Learning state for ${lang}`)
      );

      if (!learningStateGist) {
        throw new Error('No matching learning state Gist found');
      }
      await window.electronAPI.openExternal(learningStateGist.html_url);

      const gistContent = await window.ipc.invoke('getGitHubGistContent', learningStateGist.id, githubToken);
      console.log(gistContent)
      if (!gistContent.success) {
        throw new Error(gistContent.error);
      }

      const content = gistContent.gist.files[0].content;
      const parsed = JSON.parse(content);
      await window.ipc.invoke("updateContentBatch", parsed, lang);

      console.log('Learning state loaded successfully!');
      alert('Learning state loaded successfully!');
    } catch (error) {
      console.error('Failed to load learning state:', error);
      alert(`Failed to load learning state: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [githubUsername, githubToken, lang]);

  const openTokenCreationPage = () => {
    window.ipc.invoke('open-external', 'https://github.com/settings/tokens/new');
  };

  return (
      <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row gap-2 items-center">
          <input
              type="text"
              placeholder="GitHub Username"
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
              className="flex-grow p-2 border rounded text-black"
          />
        </div>
        <div className="flex flex-row gap-2 items-center">
          <input
              type={showToken ? "text" : "password"}
              placeholder="GitHub Token"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              className="flex-grow p-2 border rounded text-black"
          />
          <button
              onClick={() => setShowToken(!showToken)}
              className="p-2 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none text-black dark:text-white"
          >
            {showToken ? "Hide" : "Show"}
          </button>
        </div>
        <div className="text-sm text-red-500 mb-2">
          <strong>Warning: The token ONLY requires 'gist' scope permissions.</strong>
          <p>Do not share your token with others.</p>
          <a
              href="#"
              onClick={openTokenCreationPage}
              className="text-blue-400 hover:text-blue-300 underline"
          >
            Create a new GitHub token
          </a>
        </div>
        <AwesomeButton
            type={"primary"}
            className={"w-full"}
            onPress={saveLearningHandler}
            disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Save to Gist'}
        </AwesomeButton>
        <AwesomeButton
            type={"secondary"}
            className={"w-full"}
            onPress={loadLearningHandler}
            disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load from Gist'}
        </AwesomeButton>
      </div>
  );
};