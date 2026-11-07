import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import {resolveToolCommand} from '../handler/common/mediaTools';

/** File-name prefix of embedded subtitles extracted to the temp folder. */
const TEMP_SUBTITLE_PREFIX = 'miteiru_subtitle_';

interface MediaTrack {
  index: number;
  type: 'audio' | 'video' | 'subtitle';
  codec: string;
  language?: string;
  title?: string;
  default?: boolean;
}

interface MediaInfo {
  duration: number;
  audioTracks: MediaTrack[];
  subtitleTracks: MediaTrack[];
  videoTracks: MediaTrack[];
}

export class MediaAnalyzer {
  /**
   * Check if ffprobe/ffmpeg are available
   */
  static async checkToolsAvailable(): Promise<{ ffprobe: boolean; ffmpeg: boolean }> {
    console.log(`[DEBUG] checkToolsAvailable called`);
    const checkTool = (toolName: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const child = spawn(toolName, ['-version']);
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
    };

    const [ffprobeAvailable, ffmpegAvailable] = await Promise.all([
      resolveToolCommand('ffprobe').then(checkTool),
      resolveToolCommand('ffmpeg').then(checkTool)
    ]);

    return { ffprobe: ffprobeAvailable, ffmpeg: ffmpegAvailable };
  }

  /**
   * Analyze media file to get track information
   */
  static async analyzeFile(filePath: string): Promise<MediaInfo> {
    
    // Check if tools are available
    const toolsStatus = await this.checkToolsAvailable();
    
    if (!toolsStatus.ffprobe) {
      throw new Error(`FFprobe not found. Please install FFmpeg and make sure it's in your PATH.`);
    }
    const ffprobeCommand = await resolveToolCommand('ffprobe');

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath
      ];


      const ffprobe = spawn(ffprobeCommand, args);
      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${error}`));
          return;
        }


        try {
          const data = JSON.parse(output);
          
          const mediaInfo = this.parseFFprobeOutput(data);
          resolve(mediaInfo);
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
        }
      });

      ffprobe.on('error', (err) => {
        reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
      });
    });
  }

  /**
   * Extract embedded subtitle track to temporary file
   */
  static async extractSubtitle(
    inputPath: string, 
    streamIndex: number, 
    outputFormat: 'srt' | 'ass' | 'vtt' = 'srt'
  ): Promise<string> {
    
    const tempDir = os.tmpdir();
    const outputPath = path.join(
      tempDir, 
      `${TEMP_SUBTITLE_PREFIX}${Date.now()}_${streamIndex}.${outputFormat}`
    );
    const ffmpegCommand = await resolveToolCommand('ffmpeg');

    return new Promise((resolve, reject) => {
      // Use direct stream mapping: 0:5 instead of 0:s:5
      const args = [
        '-i', inputPath,
        '-map', `0:${streamIndex}`, // Direct stream index, not subtitle-relative
        '-c:s', outputFormat === 'srt' ? 'srt' : outputFormat,
        '-y', // Overwrite output file
        outputPath
      ];


      const ffmpeg = spawn(ffmpegCommand, args);
      let error = '';

      ffmpeg.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffmpeg.on('close', (code) => {
        
        if (code !== 0) {
          reject(new Error(`ffmpeg subtitle extraction failed: ${error}`));
          return;
        }

        resolve(outputPath);
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Get available subtitle formats for a track
   */
  static getSubtitleFormat(codec: string): 'srt' | 'ass' | 'vtt' {
    switch (codec.toLowerCase()) {
      case 'ass':
      case 'ssa':
        return 'ass';
      case 'webvtt':
        return 'vtt';
      default:
        return 'srt';
    }
  }

  /**
   * Clean up temporary subtitle files
   */
  static isTempSubtitlePath(filePath: unknown): boolean {
    if (typeof filePath !== 'string' || filePath === '') return false;
    const resolved = path.resolve(filePath);
    return path.dirname(resolved) === path.resolve(os.tmpdir())
      && path.basename(resolved).startsWith(TEMP_SUBTITLE_PREFIX);
  }

  static async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }

  private static parseFFprobeOutput(data: any): MediaInfo {
    const streams = data.streams || [];
    const format = data.format || {};


    const audioTracks: MediaTrack[] = [];
    const subtitleTracks: MediaTrack[] = [];
    const videoTracks: MediaTrack[] = [];

    streams.forEach((stream: any) => {

      const track: MediaTrack = {
        index: stream.index,
        type: stream.codec_type,
        codec: stream.codec_name,
        language: stream.tags?.language,
        title: stream.tags?.title,
        default: stream.disposition?.default === 1
      };

      switch (stream.codec_type) {
        case 'audio':
          audioTracks.push({
            ...track,
            type: 'audio'
          });
          break;
        case 'subtitle':
          subtitleTracks.push({
            ...track,
            type: 'subtitle'
          });
          break;
        case 'video':
          videoTracks.push({
            ...track,
            type: 'video'
          });
          break;
        default:
      }
    });

    const result = {
      duration: parseFloat(format.duration) || 0,
      audioTracks,
      subtitleTracks,
      videoTracks
    };


    return result;
  }
}

// Types are exported via the class declaration above
