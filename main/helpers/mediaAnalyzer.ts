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
    
    // Check if tools are available
    const toolsStatus = await this.checkToolsAvailable();
    
    if (!toolsStatus.ffprobe) {
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


      const ffmpeg = spawn('ffmpeg', args);
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
   * Create a version of the video with selected audio track in same folder
   */
  static async reencodeVideoWithAudioTrack(
    inputPath: string,
    audioStreamIndex: number,
    convertToX264?: boolean,
    totalDuration?: number,
    onProgress?: (progress: string) => void
  ): Promise<string> {
    console.log(`[DEBUG] reencodeVideoWithAudioTrack called with:`, {
      inputPath,
      audioStreamIndex,
      convertToX264,
      totalDuration,
      hasProgressCallback: !!onProgress
    });
    
    const inputDir = path.dirname(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    const selectedTrackInfo = `_audio${audioStreamIndex}${convertToX264 ? '_h264' : ''}`;
    // Use MKV to preserve all subtitle formats and codecs
    const outputPath = path.join(inputDir, `${inputName}${selectedTrackInfo}.mkv`);

    return new Promise((resolve, reject) => {
      // Create video with selected audio track + all subtitles using MKV container
      const args = [
        '-i', inputPath,
        '-map', '0:v:0', // First video stream
        '-map', `0:${audioStreamIndex}`, // Selected audio stream
        '-map', '0:s?', // All subtitle streams (? means optional)
        '-c:v', convertToX264 ? 'libx264' : 'copy', // Convert to H.264 or copy video
        '-c:a', 'aac', // Convert audio to AAC for web compatibility
        '-c:s', 'copy', // Copy all subtitle streams as-is
        '-b:a', '128k', // Audio bitrate
        ...(convertToX264 ? ['-preset', 'medium', '-crf', '23'] : []), // H.264 encoding settings
        '-progress', 'pipe:1', // Send progress to stdout
        '-y', // Overwrite output file
        outputPath
      ];

      console.log(`[DEBUG] FFmpeg command: ffmpeg ${args.join(' ')}`);
      console.log(`[DEBUG] Input path: ${inputPath}`);
      console.log(`[DEBUG] Output path: ${outputPath}`);
      console.log(`[DEBUG] Convert to X264: ${convertToX264}`);
      console.log(`[DEBUG] Total duration: ${totalDuration}s`);

      const ffmpeg = spawn('ffmpeg', args);
      let error = '';

      ffmpeg.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[DEBUG] FFmpeg stdout:`, output.trim());
        
        // Parse FFmpeg progress output
        if ((output.includes('time=') || output.includes('out_time=')) && onProgress) {
          console.log(`[DEBUG] onProgress callback exists:`, typeof onProgress);
          // Handle both formats: time=HH:MM:SS.SS and out_time=HH:MM:SS.SSSSSS
          const timeMatch = output.match(/(?:out_time|time)=(\d{2}:\d{2}:\d{2}\.\d+)/);
          if (timeMatch) {
            console.log(`[DEBUG] Time match found:`, timeMatch[1]);
            const action = convertToX264 ? 'Converting to H.264...' : 'Processing...';
            
            if (totalDuration && totalDuration > 0) {
              try {
                // Convert time string to seconds
                const timeParts = timeMatch[1].split(':');
                const currentSeconds = 
                  parseInt(timeParts[0]) * 3600 + // hours to seconds
                  parseInt(timeParts[1]) * 60 +   // minutes to seconds
                  parseFloat(timeParts[2]);       // seconds
                
                const percentage = Math.min(100, Math.max(0, Math.round((currentSeconds / totalDuration) * 100)));
                console.log(`[DEBUG] Progress: ${currentSeconds}s / ${totalDuration}s = ${percentage}%`);
                const progressMessage = `${action} ${percentage}% (time: ${timeMatch[1]})`;
                console.log(`[DEBUG] Calling onProgress with:`, progressMessage);
                onProgress(progressMessage);
              } catch (err) {
                console.log(`[DEBUG] Time parsing error:`, err);
                // Fallback to time display if parsing fails
                onProgress(`${action} ${timeMatch[1]}`);
              }
            } else {
              console.log(`[DEBUG] No duration available, showing time: ${timeMatch[1]}`);
              onProgress(`${action} ${timeMatch[1]}`);
            }
          }
        }
      });

      ffmpeg.stderr.on('data', (data) => {
        const stderr = data.toString();
        console.log(`[DEBUG] FFmpeg stderr:`, stderr.trim());
        
        // Also check stderr for progress (sometimes more reliable)
        if (stderr.includes('time=') && onProgress) {
          const timeMatch = stderr.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
          if (timeMatch) {
            console.log(`[DEBUG] Time match found in stderr:`, timeMatch[1]);
            const action = convertToX264 ? 'Converting to H.264...' : 'Processing...';
            
            if (totalDuration && totalDuration > 0) {
              try {
                // Convert time string to seconds
                const timeParts = timeMatch[1].split(':');
                const currentSeconds = 
                  parseInt(timeParts[0]) * 3600 + // hours to seconds
                  parseInt(timeParts[1]) * 60 +   // minutes to seconds
                  parseFloat(timeParts[2]);       // seconds
                
                const percentage = Math.min(100, Math.max(0, Math.round((currentSeconds / totalDuration) * 100)));
                console.log(`[DEBUG] Progress from stderr: ${currentSeconds}s / ${totalDuration}s = ${percentage}%`);
                const progressMessage = `${action} ${percentage}%`;
                console.log(`[DEBUG] Calling onProgress with (stderr):`, progressMessage);
                onProgress(progressMessage);
              } catch (err) {
                console.log(`[DEBUG] Time parsing error from stderr:`, err);
                onProgress(`${action} ${timeMatch[1]}`);
              }
            } else {
              onProgress(`${action} ${timeMatch[1]}`);
            }
          }
        }
        
        if (stderr.includes('Error') || stderr.includes('Invalid') || stderr.includes('failed')) {
          console.log(`[DEBUG] Error detected in stderr:`, stderr.trim());
          error += stderr;
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`[DEBUG] FFmpeg process closed with code: ${code}`);
        
        if (code !== 0) {
          console.log(`[DEBUG] FFmpeg failed with error:`, error);
          reject(new Error(`ffmpeg reencode failed: ${error}`));
          return;
        }

        // Send final completion message
        if (onProgress) {
          const action = convertToX264 ? 'Video conversion completed!' : 'Processing completed!';
          onProgress(action);
        }
        
        console.log(`[DEBUG] FFmpeg completed successfully. Output: ${outputPath}`);
        resolve(outputPath);
      });

      ffmpeg.on('error', (err) => {
        console.log(`[DEBUG] FFmpeg spawn error:`, err);
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
      });

      // Add process start debug
      console.log(`[DEBUG] FFmpeg process started with PID: ${ffmpeg.pid}`);
    });
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


    const audioTracks: MediaTrack[] = [];
    const subtitleTracks: MediaTrack[] = [];
    const videoTracks: MediaTrack[] = [];

    streams.forEach((stream: any, index: number) => {

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
