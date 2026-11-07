// Must stay first: under Tauri it defines window.backend before any page code runs.
import '../platform/installTauriBridge'
import React, { useEffect } from 'react'
import type { AppProps } from 'next/app'
import { UserNotesProvider } from '../hooks/useUserNotes'
import { useAppFont } from '../hooks/useAppFont'
import { UpdateNotice } from '../components/UI/UpdateNotice'

// Bundled fonts (renderer/utils/fonts.ts): every weight, loaded per character range as needed.
import '@fontsource-variable/nunito/wght.css'
import '@fontsource-variable/noto-sans-jp/wght.css'
import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/noto-sans-tc/wght.css'
import '../styles/globals.css'

function MyApp({ Component, pageProps }: AppProps) {
  const [appFont] = useAppFont()
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

export default MyApp
