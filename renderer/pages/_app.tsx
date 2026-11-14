// Must stay first: under Tauri it defines window.backend before any page code runs.
import '../platform/installTauriBridge'
import React, { useEffect } from 'react'
import type { AppProps } from 'next/app'
import { UserNotesProvider } from '../hooks/useUserNotes'
import { useAppFont } from '../hooks/useAppFont'
import { UpdateNotice } from '../components/UI/UpdateNotice'
import {disableDefaultContextMenu} from '../utils/contextMenu'
import {AppErrorBoundary} from '../components/UI/AppErrorBoundary'
import {useAssistantWindow} from '../hooks/useAssistantWindow'

// Bundled fonts (renderer/utils/fonts.ts): every weight, loaded per character range as needed.
import '@fontsource-variable/nunito/wght.css'
import '@fontsource-variable/noto-sans-jp/wght.css'
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/noto-sans-tc/wght.css'
import '../styles/globals.css'

function AppContents({ Component, pageProps }: AppProps) {
  const [appFont] = useAppFont()
  useEffect(() => disableDefaultContextMenu(document), [])
  useAssistantWindow()
  useEffect(() => {
    document.documentElement.style.setProperty('--miteiru-app-font', appFont)
  }, [appFont])

  return (
    <UserNotesProvider>
      <Component {...pageProps} />
      <UpdateNotice />
    </UserNotesProvider>
  )
}

function MyApp(props: AppProps) {
  return <AppErrorBoundary><AppContents {...props} /></AppErrorBoundary>
}

export default MyApp
