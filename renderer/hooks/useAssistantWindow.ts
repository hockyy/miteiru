import {useEffect} from 'react';
import Router from 'next/router';
import {getCurrentWindow} from '@tauri-apps/api/window';

/** The assistant's "open this video" nudge (main/mcp/windowRequests.ts); the video page takes the request itself. */
export const ASSISTANT_OPEN_VIDEO_EVENT = 'assistant:open-video';

const bringWindowForward = async () => {
  try {
    const appWindow = getCurrentWindow();
    await appWindow.unminimize();
    await appWindow.setFocus();
  } catch (error) {
    // Not a desktop window, or the platform refused to take focus: the video still opens.
    console.warn('[assistant] could not bring Miteiru forward:', error);
  }
};

// Text typed on a page (Study a text keeps it only on the page) is lost when the page changes.
const hasTypedText = () => [...document.querySelectorAll('textarea')].some((field) => field.value.trim() !== '');

/**
 * When an AI assistant asks to open a video, brings Miteiru to the front and goes to the video page,
 * whatever page the learner was on; a page holding typed text asks first. The video page then takes
 * the request (useAssistantOpenVideo). Turned down, the request is dropped, so it can't open later
 * on its own when the learner next shows the video page.
 */
export const useAssistantWindow = () => {
  useEffect(() => {
    if (!window.backend) return;
    return window.backend.on(ASSISTANT_OPEN_VIDEO_EVENT, async () => {
      await bringWindowForward();
      if (Router.pathname === '/video') return;
      if (hasTypedText() && !window.confirm('Your AI assistant wants to open a video in Miteiru. Leave this page? What you typed here will be lost.')) {
        await window.backend.invoke('assistant:decline-open-request')
          .catch((error) => console.error('[assistant] could not turn the video down:', error));
        return;
      }
      void Router.push('/video');
    });
  }, []);
};
