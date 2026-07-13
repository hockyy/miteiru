import React from 'react'
import type { AppProps } from 'next/app'
import { UserNotesProvider } from '../hooks/useUserNotes'

import '../styles/globals.css'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <UserNotesProvider>
      <Component {...pageProps} />
    </UserNotesProvider>
  )
}

export default MyApp
