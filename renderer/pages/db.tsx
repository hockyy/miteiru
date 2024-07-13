import React from 'react';
import Head from 'next/head';
import {useState, useEffect, useCallback} from 'react';
import useMeaning from "../hooks/useMeaning";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import {ipcRenderer} from 'electron';


const curLang = 'zh-CN';

function DBEditorPage() {
  const {
    setMeaning,
    undo
  } = useMeaning();
  const [, setShowSidebar] = useState(0);
  useLearningKeyBind(setMeaning, setShowSidebar, undo);
  const [srsData, setSrsData] = useState<Record<string, any>>({});
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const data = await ipcRenderer.invoke('getAllSRS', curLang);
      setSrsData(data);
    } catch (error) {
      console.error('Failed to fetch SRS data:', error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleEdit = (char: string, path: string, value: string | number) => {
    setSrsData(prevData => {
      const newData = {...prevData};
      const keys = path.split('.');
      let current: any = newData[char];
      for (let i = 0; i < keys.length - 1; i++) {
        if (keys[i] === 'skills') {
          current = current[keys[i]][parseInt(keys[i + 1], 10)][1];
          i++; // skip the next key as we've already used it
        } else {
          current = current[keys[i]];
        }
      }

      const lastKey = keys[keys.length - 1];
      if (typeof current[lastKey] === 'number') {
        current[lastKey] = Number(value);
      } else {
        current[lastKey] = value;
      }
      return newData;
    });
  };

  const handleBanishAllProgress = useCallback(async () => {
    if (confirm('Are you sure you want to banish all SRS entries? This action cannot be undone.')) {
      try {
        const result = await ipcRenderer.invoke('banishSRS');
        if (result.success) {
          alert(result.message);
          setSrsData({}); // Clear the local state
          setSelectedChar(null); // Reset selected character
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('Failed to banish SRS entries:', error);
        alert('Failed to banish SRS entries. Please try again.');
      }
    }
  }, []);

  const handleSetSRS = async (character: string) => {
    try {
      const result = await ipcRenderer.invoke('setSRS', curLang, character, JSON.stringify(srsData[character]));
      if (result.success) {
        console.log(result.message);
        // Maybe refresh your data or update UI here
      } else {
        console.error('Failed to set SRS data:', result.error);
        // Handle the error in your UI
      }
    } catch (error) {
      console.error('Error invoking setSRS:', error);
      // Handle any invocation errors
    }
  };

  const filteredChars = useCallback(() =>
      Object.keys(srsData).filter(char =>
          char.toLowerCase().includes(searchTerm.toLowerCase())
      ), [srsData, searchTerm]);

  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  }, []);

  return (
      <React.Fragment>
        <Head>
          <title>Miteiru - SRS Editor</title>
        </Head>
        <div className="flex flex-col bg-gray-100 min-h-screen w-full text-gray-800 p-4">
          <h1 className="text-2xl font-bold mb-4">SRS Editor</h1>
          <button
              onClick={handleBanishAllProgress}
              className="mb-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          >
            Banish All Progress
          </button>
          <div className="flex gap-4 h-[calc(100vh-160px)]">
            <div className="w-1/4 bg-white rounded-lg shadow-md p-4 flex flex-col">
              <input
                  type="text"
                  placeholder="Search characters..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-2 p-2 border rounded"
              />
              <div className="overflow-y-auto flex-grow">
                {filteredChars().map(char => (
                    <div
                        key={char}
                        onClick={() => setSelectedChar(char)}
                        className={`cursor-pointer p-2 rounded ${selectedChar === char ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                    >
                      {char}
                    </div>
                ))}
              </div>
            </div>
            <div className="w-3/4 bg-white rounded-lg shadow-md p-4 overflow-y-auto">
              {selectedChar ? (
                  <div>
                    <h2 className="text-xl font-semibold mb-4">{selectedChar}</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(srsData[selectedChar]).map(([key, value]) => {
                        if (key === 'skills') {
                          return (
                              <div key={key} className="col-span-2">
                                <h3 className="text-lg font-semibold mb-2">Skills</h3>
                                <div className="grid grid-cols-2 gap-2">
                                  {(value as [number, any][]).map(([skillIndex, skill], index) => (
                                      <div key={index} className="border p-2 rounded">
                                        <h4 className="font-medium">{skill.skillName}</h4>
                                        {Object.entries(skill).map(([skillKey, skillValue]) => {
                                          const isTimeField = skillKey === 'lastUpdated' || skillKey === 'nextReviewTime';
                                          const isNumericField = isTimeField || skillKey === 'level';
                                          if (skillKey === "skillName") return null;
                                          return (
                                              <div key={skillKey} className="mt-1">
                                                <label
                                                    className="text-sm text-gray-600">{skillKey}</label>
                                                {isTimeField && (
                                                    <div className="text-xs text-gray-500">
                                                      {formatDate(skillValue as number)}
                                                    </div>
                                                )}
                                                <input
                                                    className="w-full p-1 border rounded text-sm"
                                                    value={String(skillValue)}
                                                    type="text"
                                                    onChange={e => {
                                                      const newValue = isNumericField ? Number(e.target.value) : e.target.value;
                                                      handleEdit(selectedChar, `skills.${skillIndex}.${skillKey}`, newValue);
                                                    }}/>
                                              </div>
                                          );
                                        })}
                                      </div>
                                  ))}
                                </div>
                              </div>
                          );
                        } else {
                          return (
                              <div key={key}>
                                <label
                                    className="block text-sm font-medium text-gray-700">{key}</label>
                                <input
                                    className="w-full p-2 border rounded mt-1"
                                    value={value as string}
                                    onChange={e => handleEdit(selectedChar, key, e.target.value)}
                                />
                              </div>
                          );
                        }
                      })}
                    </div>
                    <button
                        onClick={() => handleSetSRS(selectedChar)}
                        className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                    >
                      Set SRS for {selectedChar}
                    </button>
                  </div>
              ) : (
                  <p className="text-center text-gray-500">Select a character to edit</p>
              )}
            </div>
          </div>
        </div>
      </React.Fragment>
  )
      ;
}

export default DBEditorPage;