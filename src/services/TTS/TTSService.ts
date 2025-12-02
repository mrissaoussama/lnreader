import * as Speech from 'expo-speech';
import { ChapterInfo } from '@database/types';
import { load } from 'cheerio';
import ServiceManager, { BackgroundTaskMetadata } from '../ServiceManager';
import { DeviceEventEmitter } from 'react-native';

interface TTSOptions {
  rate?: number;
  pitch?: number;
  voice?: string;
}

export class TTSService {
  static isSpeaking = false;
  static isPaused = false;
  static currentSentenceIndex = 0;
  static sentences: string[] = [];
  static options: TTSOptions = {};

  static EVENT_SENTENCE_CHANGED = 'TTS_SENTENCE_CHANGED';

  static async start(
    chapter: ChapterInfo,
    html: string,
    options: TTSOptions = {},
  ) {
    ServiceManager.manager.addTask({
      name: 'TTS',
      data: {
        chapter,
        text: html,
        options,
      },
    });
  }

  static async play(
    data: { chapter: ChapterInfo; text: string; options: TTSOptions },
    setMeta: (
      transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
    ) => void,
  ) {
    this.stop();
    this.options = data.options;
    this.sentences = this.parseText(data.text);
    this.currentSentenceIndex = 0;
    this.isSpeaking = true;
    this.isPaused = false;

    return new Promise<void>(resolve => {
      this.speakNext(resolve, setMeta);
    });
  }

  static parseText(html: string): string[] {
    const $ = load(html);
    $('script').remove();
    $('style').remove();

    const text = $.text();
    // Improved sentence splitting
    return text
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  static speakNext(resolve: () => void, setMeta: any) {
    if (!this.isSpeaking) {
      resolve();
      return;
    }

    if (this.isPaused) {
      setTimeout(() => this.speakNext(resolve, setMeta), 500);
      return;
    }

    if (this.currentSentenceIndex >= this.sentences.length) {
      this.isSpeaking = false;
      resolve();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];

    setMeta((meta: any) => ({
      ...meta,
      progress: this.currentSentenceIndex / this.sentences.length,
      progressText: sentence,
    }));

    DeviceEventEmitter.emit(this.EVENT_SENTENCE_CHANGED, {
      index: this.currentSentenceIndex,
      text: sentence,
    });

    Speech.speak(sentence, {
      voice: this.options.voice,
      rate: this.options.rate,
      pitch: this.options.pitch,
      onDone: () => {
        this.currentSentenceIndex++;
        this.speakNext(resolve, setMeta);
      },
      onStopped: () => {
        if (!this.isSpeaking) {
          resolve();
        }
      },
      onError: e => {
        // eslint-disable-next-line no-console
        console.error('TTS Error:', e);
        this.currentSentenceIndex++;
        this.speakNext(resolve, setMeta);
      },
    });
  }

  static stop() {
    this.isSpeaking = false;
    this.isPaused = false;
    Speech.stop();
    ServiceManager.manager.cancelTask('TTS');
  }

  static pause() {
    this.isPaused = true;
    Speech.stop();
  }

  static resume() {
    if (this.isPaused) {
      this.isPaused = false;
    }
  }
}
