"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice input, using the browser's own speech recognition.
 *
 * WHY NOT SEND THE AUDIO TO CLAUDE: the Messages API accepts text, images and
 * documents. There is no audio content block. Transcribing server-side would
 * mean a second vendor, a second key and a per-minute bill — for something
 * every Chromium and Safari browser already does locally, for free, without
 * the recording ever leaving the machine.
 *
 * Firefox ships no SpeechRecognition, so `supported` is false there and the
 * caller hides the button rather than offering one that does nothing. It is
 * also secure-context only: it works on localhost and on HTTPS, and simply
 * reports unsupported anywhere else.
 */

/** The slice of the API we use. The DOM lib's own typings are not universal. */
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionConstructor = new () => Recognition;

function constructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function useSpeechInput({
  onStart,
  onTranscript,
}: {
  onStart: () => void;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  // Detected in an effect rather than at module scope: this renders on the
  // server first, where `window` does not exist.
  useEffect(() => setSupported(Boolean(constructor())), []);

  const toggle = useCallback(() => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = constructor();
    if (!Ctor) return;

    const instance = new Ctor();
    instance.continuous = false;
    // Interim results are what make this feel live — the words appear as they
    // are spoken instead of arriving in one lump when the speaker stops.
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";

    let settled = "";
    instance.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else interim += result[0].transcript;
      }
      onTranscript(settled + interim);
    };
    // A denied microphone permission and a silent timeout both land here, and
    // neither should leave the button stuck in its listening state.
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);

    recognition.current = instance;
    onStart();
    instance.start();
    setListening(true);
  }, [listening, onStart, onTranscript]);

  // Stop the microphone if the panel unmounts mid-sentence.
  useEffect(() => () => recognition.current?.stop(), []);

  return { supported, listening, toggle };
}
