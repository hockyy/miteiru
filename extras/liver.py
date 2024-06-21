import logging
import os
import threading
import subprocess
import shutil
import re
from datetime import timedelta
from tkinter import Tk, Label, Entry, Button, StringVar, OptionMenu, END, messagebox, filedialog
import tkinter.scrolledtext as scrolledtext

# try:
#     from easynmt import EasyNMT
#     easy_nmt_available = True
# except ImportError:
#     easy_nmt_available = False
#     print("EasyNMT is not installed. English subtitles will not be generated.")


# Regular expression to match subtitle lines
subtitle_regex = re.compile(r'^\[(\d+):(\d{2}\.\d{3}) --> (\d+):(\d{2}\.\d{3})\] (.+)$')

def format_timestamp_from_match(minutes, sec_mili):
    total_seconds = float(minutes) * 60 + float(sec_mili)
    secint = int(total_seconds)
    milliseconds = int((total_seconds - secint) * 1000)
    hours = secint // 3600
    secint %= 3600
    minutes = secint // 60
    secint %= 60
    return f"{hours:02}:{minutes:02}:{secint:02},{milliseconds:03}"

# Configure logging
logging.basicConfig()
logging.getLogger("faster_whisper").setLevel(logging.DEBUG)

def format_timestamp(seconds):
    delta = timedelta(seconds=seconds)
    hours, remainder = divmod(delta.total_seconds(), 3600)
    minutes, seconds = divmod(remainder, 60)
    milliseconds = int((seconds - int(seconds)) * 1000)
    return f"{int(hours):02}:{int(minutes):02}:{int(seconds):02},{milliseconds:03}"

class SubtitleTranscriber:
    def __init__(self, model="large-v3", device="CUDA"):
        self.model = model
        self.device = device
        self.stop_flag = threading.Event()
        # self.nmt_model = None if not easy_nmt_available else EasyNMT('opus-mt')
        self.thread = None

    def transcribe_and_write_srt_live(self, audio_file, log_text_widget, lang, beam_size):
        output_dir = os.path.dirname(audio_file)
        base_name = os.path.splitext(os.path.basename(audio_file))[0]
        cjk_srt_file = os.path.join(output_dir, f"{base_name}.{lang}.srt")
        en_srt_file = os.path.join(output_dir, f"{base_name}.en.srt")

        # Command for whisper-faster
        command = [
            'whisper-faster.exe', audio_file,
            '--model', self.model,
            '--device', self.device,
            '--output_dir', output_dir,
            '--output_format', 'srt',
            '--task', 'transcribe',
            '--beam_size', str(beam_size),
            '--language', lang,
            '--verbose', 'true',
            '--standard_asia'
        ]
        process = None
        try:
            log_text_widget.insert(END, f"Starting transcription for {audio_file}\n")
            log_text_widget.insert(END, f"{' '.join(command)}\n")
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        except:
            return
        cjk_tmp_srt_file = f"{output_dir}/{base_name}.{lang}.tmp.srt"
        en_tmp_srt_file = f"{output_dir}/{base_name}.en.tmp.srt"
        with open(cjk_tmp_srt_file, 'w', encoding='utf-8') as cjk_f, open(en_tmp_srt_file, 'w', encoding='utf-8') as en_f:
            segment_index = 1
            log_text_widget.insert(END, cjk_tmp_srt_file)
            log_text_widget.insert(END, "\n")
            log_text_widget.insert(END, en_tmp_srt_file)
            log_text_widget.insert(END, "\n")
            for line in process.stdout:
                if self.stop_flag.is_set():
                    process.terminate()
                    log_text_widget.insert(END, "Transcription stopped.\n")
                    return
                if '-->' in line:
                    log_text_widget.insert(END, line)
                    log_text_widget.insert(END, "\n")
                    match = subtitle_regex.match(line)
                    if match:
                        hours_start, minutes_seconds_start, hours_end, minutes_seconds_end, text = match.groups()
                        start_time = format_timestamp_from_match(hours_start, minutes_seconds_start)
                        end_time = format_timestamp_from_match(hours_end, minutes_seconds_end)
                        log_text_widget.insert(END, f"{start_time} --> {end_time}")
                        log_text_widget.insert(END, "\n")
                        cjk_f.write(f"{segment_index}\n{start_time} --> {end_time}\n{text}\n\n")
                        cjk_f.flush()

                        # # Translate the text to English if NMT model is available
                        # if self.nmt_model:
                        #     try:
                        #         translated_text = self.nmt_model.translate(text, target_lang='en')
                        #         en_f.write(f"{segment_index}\n")
                        #         en_f.write(f"{start_time} --> {end_time}\n")
                        #         en_f.write(f"{translated_text}\n\n")
                        #         en_f.flush()  # Ensure immediate writing
                        #     except Exception as e:
                        #         print(f"Error during translation: {e}")

                        segment_index += 1

        process.stdout.close()
        process.wait()

        shutil.copy2(cjk_tmp_srt_file, cjk_srt_file)
        shutil.copy2(en_tmp_srt_file, en_srt_file)

        if os.path.exists(cjk_srt_file):
            log_text_widget.insert(END, f"Transcription completed. SRT file saved at {cjk_srt_file}\n")
        else:
            log_text_widget.insert(END, "Transcription failed or was stopped before completion.\n")

    def start_transcription(self, audio_file, log_text_widget, lang, beam_size):
        if self.thread and self.thread.is_alive():
            log_text_widget.insert(END, "Transcription is already running.\n")
            return

        self.stop_flag.clear()
        self.thread = threading.Thread(target=self.transcribe_and_write_srt_live, args=(audio_file, log_text_widget, lang, beam_size))
        self.thread.start()

    def stop_transcription(self):
        if self.thread and self.thread.is_alive():
            self.stop_flag.set()
            self.thread.join()
        else:
            print("No transcription process is running.")


# Initialize the transcriber
transcriber = SubtitleTranscriber()

# Function to start the transcription process
def start_transcription_process(audio_file, log_text_widget, lang, beam_size):
    transcriber.start_transcription(audio_file, log_text_widget, lang, beam_size)

# Function to stop the transcription process
def stop_transcription_process():
    transcriber.stop_transcription()

# Tkinter UI
class TranscriptionApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Subtitle Transcriber")
        
        self.language_var = StringVar(value='zh')
        self.filename_var = StringVar(value='C:/Users/hocky/liver/peppa.mp4')
        self.beam_size_var = StringVar(value='3')

        self.current_row = 0
        def increaser(increase = 0):
            ret_val = self.current_row
            self.current_row += increase
            return ret_val
        
        Label(root, text="Language (or auto-detect):").grid(row=increaser(), column=0, padx=5, pady=5)
        languages = ['ja', 'ko', 'zh', 'yue']
        OptionMenu(root, self.language_var, *languages).grid(row=increaser(), column=1, padx=5, pady=5)
        
        increaser(1)
        Label(root, text="BeamSize:").grid(row=increaser(), column=0, padx=5, pady=5)
        Entry(root, textvariable=self.beam_size_var).grid(row=increaser(), column=1, padx=5, pady=5)
        
        increaser(1)
        Label(root, text="Filename:").grid(row=increaser(), column=0, padx=5, pady=5)
        Entry(root, textvariable=self.filename_var).grid(row=increaser(), column=1, padx=5, pady=5)
        Button(root, text="Browse", command=self.browse_file).grid(row=increaser(), column=2, padx=5, pady=5)
        
        increaser(1)
        Button(root, text="Start Transcription", command=self.start_transcription).grid(row=increaser(1), column=0, columnspan=3, padx=5, pady=5)
        Button(root, text="Stop Transcription", command=stop_transcription_process).grid(row=increaser(), column=0, columnspan=3, padx=5, pady=5)

        increaser(1)
        self.log_text = scrolledtext.ScrolledText(root, wrap='word', width=50, height=20)
        self.log_text.grid(row=increaser(), column=0, columnspan=3, padx=5, pady=5)
    
    def browse_file(self):
        filename = filedialog.askopenfilename(filetypes=[("Audio Files", "*.mp4 *.wav *.mp3")])
        self.filename_var.set(filename)
    
    def start_transcription(self):
        audio_file = self.filename_var.get()
        if not audio_file:
            messagebox.showerror("Error", "Please select a file.")
            return
        self.log_text.delete(1.0, END)
        start_transcription_process(audio_file, self.log_text, self.language_var.get(), self.beam_size_var.get())

# Run the app
root = Tk()
app = TranscriptionApp(root)
root.mainloop()
