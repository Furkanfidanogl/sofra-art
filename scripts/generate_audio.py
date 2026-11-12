"""Original instrumental prototype study. No samples or third-party recordings.
Creates a 64-second, softly enveloped ambient chord progression and plucked notes.
Convert WAV to AAC with macOS afconvert for browser playback.
"""
import math
import wave
from array import array
from pathlib import Path

rate = 22050
duration = 64
count = rate * duration
signal = [0.0] * count
chords = [(48, 55, 59, 64), (45, 52, 57, 60), (41, 48, 53, 57), (43, 50, 55, 59)]
for block in range(8):
    notes = chords[block % 4]
    start = block * 8
    for note in notes:
        freq = 440 * 2 ** ((note - 69) / 12)
        for j in range(10 * rate):
            index = int(start * rate) + j
            if index >= count:
                break
            t = j / rate
            envelope = min(1, t / 2.5) * max(0, min(1, (10 - t) / 3))
            signal[index] += .025 * envelope * (
                math.sin(2 * math.pi * freq * t)
                + .25 * math.sin(2 * math.pi * (freq * 2 + .15) * t)
            )
    for beat in range(8):
        note = notes[(beat * 3) % 4] + 12
        freq = 440 * 2 ** ((note - 69) / 12)
        begin = int((start + beat + .25) * rate)
        for j in range(3 * rate):
            index = begin + j
            if index >= count:
                break
            t = j / rate
            envelope = (1 - math.exp(-t * 90)) * math.exp(-t * 1.7)
            signal[index] += .085 * envelope * (
                math.sin(2 * math.pi * freq * t)
                + .25 * math.sin(2 * math.pi * freq * 2 * t)
                + .08 * math.sin(2 * math.pi * freq * 3 * t)
            )
# A quiet stereo delay and gentle loop-edge fades.
frames = array('h')
for i, value in enumerate(signal):
    t = i / rate
    fade = min(1, t / 2, (duration - t) / 3)
    left = value + (.19 * signal[i - int(.37 * rate)] if i > .37 * rate else 0)
    right = value + (.17 * signal[i - int(.53 * rate)] if i > .53 * rate else 0)
    frames.extend((int(math.tanh(left * 1.8) * fade * 26000), int(math.tanh(right * 1.8) * fade * 26000)))
out = Path(__file__).resolve().parents[1] / 'public' / 'audio'
out.mkdir(exist_ok=True)
with wave.open(str(out / 'evening.wav'), 'wb') as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(rate)
    file.writeframes(frames.tobytes())
print(f'Original ambient study written: {duration}s, {rate}Hz stereo')
