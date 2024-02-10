import React, {useCallback, useState} from 'react';
import Head from 'next/head';
import {ipcRenderer} from 'electron';
import {ContainerHome} from "../components/VideoPlayer/ContainerHome";
import {KeyboardHelp} from "../components/VideoPlayer/KeyboardHelp";
import useMiteiruVersion from "../hooks/useMiteiruVersion";
import 'react-awesome-button/dist/styles.css';
import {AwesomeButton} from "react-awesome-button";
import {useRouter} from "next/router";
import SmoothCollapse from "react-smooth-collapse";

const checkSymbol = ['❓', '✅', '🙃']
const initialCheck = {ok: 0, message: '🐸 ゲロゲロ'}
const mecabDefaultDirectory = {
  'darwin': '/opt/homebrew/bin/mecab',
  'linux': '/usr/bin/mecab',
  'win32': 'C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe'
}
const checkingMessage = {
  ok: 2,
  message: "checking..."
}

function Home() {
  const router = useRouter();
  const [mecab, setMecab] = useState(mecabDefaultDirectory[process.platform] ?? mecabDefaultDirectory['linux']);
  const [jmdict, setJmdict] = useState('');
  const [check, setCheck] = useState(initialCheck);
  const [tokenizerMode, setTokenizerMode] = useState(0);
  const handleClick = useCallback(async () => {
    if (tokenizerMode === 0) {
      setCheck(checkingMessage);
      const res = await ipcRenderer.invoke('loadKuromoji');
      setCheck(res);
      if (res.ok !== 1) {
        return;
      }
    } else if (tokenizerMode === 2) {
      setCheck(checkingMessage);
      const res = await ipcRenderer.invoke('loadCantonese');
      setCheck(res);
      if (res.ok !== 1) {
        return;
      }
    } else if (tokenizerMode === 3) {
      setCheck(checkingMessage);
      const res = await ipcRenderer.invoke('loadChinese');
      setCheck(res);
      if (res.ok !== 1) {
        return;
      }
    }
    await router.push('/video');
  }, [check, router, tokenizerMode]);

  const handleSelectMecabPath = useCallback(() => {
    ipcRenderer.invoke('pickFile', ['*']).then((val) => {
      if (!val.canceled) setMecab(val.filePaths[0]);
    });
  }, []);

  const handleSelectJMDictJson = useCallback(() => {
    ipcRenderer.invoke('pickFile', ['json']).then((val) => {
      if (!val.canceled) setJmdict(val.filePaths[0]);
    });
  }, []);

  const handleCheck = useCallback((cached = false) => {
    setCheck(checkingMessage);
    ipcRenderer.invoke('validateConfig', {
      mecab, jmdict, cached
    }).then(val => {
      setCheck(val);
    });
  }, [mecab, jmdict]);

  const handleRemoveJMDictCache = useCallback(() => {
    setCheck({
      ok: 2,
      message: 'Removing JMDict Cache'
    });
    ipcRenderer.invoke('removeDictCache').then(() => {
      setCheck(initialCheck);
    });
  }, []);
  const {miteiruVersion} = useMiteiruVersion();
  const ableToProceedToVideo = ((tokenizerMode === 0 || tokenizerMode === 2 || tokenizerMode === 3) && check.ok !== 2) || (tokenizerMode === 1 && check.ok === 1)
  return (
      <React.Fragment>
        <Head>
          <title>Miteiru v{miteiruVersion}</title>
        </Head>
        <div
            className={"flex flex-col justify-center items-center bg-white min-h-screen w-[100vw]"}>
          <div
              className={"flex flex-col h-fit items-center bg-blue-50 gap-4 w-full md:w-4/5 p-5 border rounded-lg border-blue-800 border-2"}>
            <div className={'flex flex-row gap-4 text-4xl text-black font-bold'}>
              <div onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setTokenizerMode(parseInt(e.target.value, 10))
              }} className={'flex flex-col'}>
                <div className="custom-radio">
                  <input type="radio" id="mode0" value="0" name="tokenizerMode"
                         checked={tokenizerMode === 0} readOnly/>
                  <label htmlFor="mode0">Kuromoji - Japanese 🐣</label>
                </div>
                <div className="custom-radio">
                  <input type="radio" id="mode1" value="1" name="tokenizerMode"
                         checked={tokenizerMode === 1} readOnly/>
                  <label htmlFor="mode1">Mecab - Japanese 👹</label>
                </div>
                <div className="custom-radio">
                  <input type="radio" id="mode2" value="2" name="tokenizerMode"
                         checked={tokenizerMode === 2} readOnly/>
                  <label htmlFor="mode2">PyCantonese - Cantonese 🥘</label>
                </div>
                <div className="custom-radio">
                  <input type="radio" id="mode3" value="3" name="tokenizerMode"
                         checked={tokenizerMode === 3} readOnly/>
                  <label htmlFor="mode3">Jieba - Chinese 🐉</label>
                </div>
              </div>
            </div>
            <SmoothCollapse expanded={tokenizerMode === 1}><ContainerHome>
              <div className={"flex justify-between  gap-3 p-3 w-full"}>
                <AwesomeButton
                    onPress={handleSelectMecabPath}>
                  Select Mecab Path
                </AwesomeButton>
                <input
                    className={"text-blue-800 outline-none rounded-sm text-lg md:min-w-[50vw] border border-gray-300 focus:border-blue-500 ring-1 ring-blue-400 focus:ring-blue-500 rounded-lg"}
                    type={"text"} value={mecab}
                    onChange={(val) => {
                      setMecab(val.target.value)
                    }}></input>
              </div>
              <div className={'flex flex-col items-center gap-4'}>
                <div className={'flex flex-row gap-3'}>
                  <AwesomeButton
                      type={'secondary'}
                      disabled={check.ok === 2}
                      onPress={() => handleCheck(false)}>
                    Check
                  </AwesomeButton>
                  <AwesomeButton
                      type={'secondary'}
                      disabled={check.ok === 2}
                      onPress={() => handleCheck(true)}>
                    Check With Cache
                  </AwesomeButton>
                </div>
                <AwesomeButton
                    type={"danger"}
                    onPress={handleRemoveJMDictCache}>
                  Remove JMDict Cache
                </AwesomeButton>
              </div>
            </ContainerHome></SmoothCollapse>
            <SmoothCollapse expanded={tokenizerMode === 2}>
              <ContainerHome>
                <div className={'text-blue-800'}>
                  You can run: <pre className={'font-bold'}>pip install setuptools pycantonese</pre>
                </div>
              </ContainerHome>
            </SmoothCollapse>

            <SmoothCollapse expanded={tokenizerMode === 3}>
              <ContainerHome>
                <div className={'text-blue-800'}>
                  You can run: <pre className={'font-bold'}>/usr/bin/python3 -m pip install jieba pypinyin</pre>
                </div>
              </ContainerHome>
            </SmoothCollapse>
            <div className={'text-black'}>
              {checkSymbol[check.ok]}{' '}{check.message}
            </div>
            <AwesomeButton type={'primary'} onPress={handleClick}
                           className={ableToProceedToVideo ? '' : 'buttonDisabled'}
                           disabled={!ableToProceedToVideo}>
              {tokenizerMode === 0 && <div className={'text-xl'}>うん、ちょっと<span
                  className={'font-bold text-yellow-200'}>見てる</span>だけ 😏</div>}
              {tokenizerMode === 1 && <div className={'text-xl'}>準備OK、船長！🫡</div>}
              {tokenizerMode === 2 && <div className={'text-xl'}>Let's go!🫡</div>}
              {tokenizerMode === 3 && <div className={'text-xl'}>加油! 💥</div>}
            </AwesomeButton>
          </div>
          <KeyboardHelp/>
        </div>
      </React.Fragment>
  );
}

export default Home;
