import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

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
  private static ffprobePath: string = 'ffprobe'; // Default, can be configured

  static setFFprobePath(path: string) {
    this.ffprobePath = path;
  }

  /**
   * Check if ffprobe/ffmpeg are available
   */
  static async checkToolsAvailable(): Promise<{ ffprobe: boolean; ffmpeg: boolean }> {
    const checkTool = (toolName: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const child = spawn(toolName, ['-version']);
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
    };

    const [ffprobeAvailable, ffmpegAvailable] = await Promise.all([
      checkTool(this.ffprobePath),
      checkTool('ffmpeg')
    ]);

    return { ffprobe: ffprobeAvailable, ffmpeg: ffmpegAvailable };
  }

  /**
   * Analyze media file to get track information
   */
  static async analyzeFile(filePath: string): Promise<MediaInfo> {
    console.log('[MediaAnalyzer] Starting analysis of:', filePath);
    
    // Check if tools are available
    const toolsStatus = await this.checkToolsAvailable();
    console.log('[MediaAnalyzer] Tools availability:', toolsStatus);
    
    if (!toolsStatus.ffprobe) {
      console.error('[MediaAnalyzer] FFprobe not available');
      throw new Error(`FFprobe not found. Please install FFmpeg and make sure it's in your PATH.`);
    }
    
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath
      ];

      console.log('[MediaAnalyzer] FFprobe command:', this.ffprobePath, args.join(' '));

      const ffprobe = spawn(this.ffprobePath, args);
      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        console.log('[MediaAnalyzer] FFprobe finished with code:', code);
        
        if (code !== 0) {
          console.error('[MediaAnalyzer] FFprobe error output:', error);
          reject(new Error(`ffprobe failed: ${error}`));
          return;
        }

        console.log('[MediaAnalyzer] FFprobe raw output length:', output.length);
        console.log('[MediaAnalyzer] FFprobe raw output (first 500 chars):', output.substring(0, 500));

        try {
          const data = JSON.parse(output);
          console.log('[MediaAnalyzer] Parsed JSON data:', {
            streamsCount: data.streams?.length || 0,
            formatDuration: data.format?.duration,
            streams: data.streams?.map(s => ({
              index: s.index,
              codec_type: s.codec_type,
              codec_name: s.codec_name,
              language: s.tags?.language,
              title: s.tags?.title
            })) || []
          });
          
          const mediaInfo = this.parseFFprobeOutput(data);
          console.log('[MediaAnalyzer] Final result:', mediaInfo);
          resolve(mediaInfo);
        } catch (err) {
          console.error('[MediaAnalyzer] JSON parse error:', err);
          console.error('[MediaAnalyzer] Raw output that failed to parse:', output);
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
    console.log(`[MediaAnalyzer] Extracting subtitle stream ${streamIndex} as ${outputFormat}`);
    
    const tempDir = os.tmpdir();
    const outputPath = path.join(
      tempDir, 
      `miteiru_subtitle_${Date.now()}_${streamIndex}.${outputFormat}`
    );

    return new Promise((resolve, reject) => {
      // Use direct stream mapping: 0:5 instead of 0:s:5
      const args = [
        '-i', inputPath,
        '-map', `0:${streamIndex}`, // Direct stream index, not subtitle-relative
        '-c:s', outputFormat === 'srt' ? 'srt' : outputFormat,
        '-y', // Overwrite output file
        outputPath
      ];

      console.log(`[MediaAnalyzer] FFmpeg extraction command: ffmpeg ${args.join(' ')}`);

      const ffmpeg = spawn('ffmpeg', args);
      let error = '';

      ffmpeg.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffmpeg.on('close', (code) => {
        console.log(`[MediaAnalyzer] FFmpeg extraction finished with code: ${code}`);
        
        if (code !== 0) {
          console.error(`[MediaAnalyzer] FFmpeg extraction error:`, error);
          reject(new Error(`ffmpeg subtitle extraction failed: ${error}`));
          return;
        }

        console.log(`[MediaAnalyzer] Subtitle extracted successfully to: ${outputPath}`);
        resolve(outputPath);
      });

      ffmpeg.on('error', (err) => {
        console.error(`[MediaAnalyzer] Failed to spawn ffmpeg:`, err);
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

    console.log('[MediaAnalyzer] Parsing streams:', streams.length, 'total streams');

    const audioTracks: MediaTrack[] = [];
    const subtitleTracks: MediaTrack[] = [];
    const videoTracks: MediaTrack[] = [];

    streams.forEach((stream: any, index: number) => {
      console.log(`[MediaAnalyzer] Processing stream ${index}:`, {
        index: stream.index,
        codec_type: stream.codec_type,
        codec_name: stream.codec_name,
        language: stream.tags?.language,
        title: stream.tags?.title,
        disposition: stream.disposition
      });

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
          console.log('[MediaAnalyzer] Adding audio track:', track);
          audioTracks.push({
            ...track,
            type: 'audio'
          });
          break;
        case 'subtitle':
          console.log('[MediaAnalyzer] Adding subtitle track:', track);
          subtitleTracks.push({
            ...track,
            type: 'subtitle'
          });
          break;
        case 'video':
          console.log('[MediaAnalyzer] Adding video track:', track);
          videoTracks.push({
            ...track,
            type: 'video'
          });
          break;
        default:
          console.log('[MediaAnalyzer] Ignoring stream type:', stream.codec_type);
      }
    });

    const result = {
      duration: parseFloat(format.duration) || 0,
      audioTracks,
      subtitleTracks,
      videoTracks
    };

    console.log('[MediaAnalyzer] Parse result summary:', {
      duration: result.duration,
      audioCount: result.audioTracks.length,
      subtitleCount: result.subtitleTracks.length,
      videoCount: result.videoTracks.length
    });

    return result;
  }
}

// Types are exported via the class declaration above
