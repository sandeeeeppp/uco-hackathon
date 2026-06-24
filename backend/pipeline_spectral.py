"""
Pipeline A: The Spectral ML Engine (AASIST-L)
=============================================
Converts audio into 2D STFT / MFCC visual maps, extracts features
with a 1D-CNN scanner, and feeds them into an AASIST Graph Attention
Network (~85 K params) to detect GAN upsampling anomalies.

Currently ships with a **heuristic mock scorer** — swap in the real
ONNX-exported AASIST-L model when training is complete.
"""

import numpy as np
import librosa


class SpectralMLPipeline:
    """
    AI voice cloning tools 'stretch' or guess missing audio data,
    leaving behind digital fingerprints: unnatural harmonic spacing
    and high-frequency phase smearing. This pipeline hunts for those
    GAN upsampling anomalies.
    """

    def __init__(
        self,
        sr: int = 16000,
        n_fft: int = 512,
        hop_length: int = 160,
        n_mfcc: int = 20,
    ):
        self.sr = sr
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.n_mfcc = n_mfcc
        self.onnx_session = None  # Placeholder for ONNX Runtime session

    # ------------------------------------------------------------------ #
    #  Feature Extraction                                                 #
    # ------------------------------------------------------------------ #
    def extract_stft(self, audio: np.ndarray) -> np.ndarray:
        """STFT → log-magnitude spectrogram (2D visual map)."""
        stft = librosa.stft(
            audio, n_fft=self.n_fft, hop_length=self.hop_length
        )
        magnitude = np.abs(stft)
        log_mag = librosa.amplitude_to_db(magnitude, ref=np.max)
        return log_mag

    def extract_mfcc(self, audio: np.ndarray) -> np.ndarray:
        """MFCCs + Δ + ΔΔ for temporal texture dynamics."""
        mfcc = librosa.feature.mfcc(
            y=audio,
            sr=self.sr,
            n_mfcc=self.n_mfcc,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
        )
        delta = librosa.feature.delta(mfcc)
        delta2 = librosa.feature.delta(mfcc, order=2)
        return np.vstack([mfcc, delta, delta2])

    def extract_features(self, audio: np.ndarray) -> dict:
        """Extract all spectral features for the AASIST-L engine."""
        stft_feat = self.extract_stft(audio)
        mfcc_feat = self.extract_mfcc(audio)
        return {
            "stft": stft_feat,
            "mfcc": mfcc_feat,
            "stft_shape": stft_feat.shape,
            "mfcc_shape": mfcc_feat.shape,
        }

    # ------------------------------------------------------------------ #
    #  Inference                                                          #
    # ------------------------------------------------------------------ #
    def _mock_aasist_inference(self, features: dict) -> float:
        """
        Heuristic stand-in for the AASIST-L Graph Attention Network.
        Uses three spectral statistics that correlate with synthetic
        artifacts.  Replace with real ONNX .run() call later.
        """
        stft = features["stft"]
        mfcc = features["mfcc"]

        total_energy = np.sum(np.abs(stft))
        if total_energy < 1e-6:
            return 0.5  # silence → uncertain

        # H1: High-frequency energy ratio — AI artefacts live up top
        upper_third = stft[stft.shape[0] * 2 // 3 :, :]
        hf_ratio = float(np.sum(np.abs(upper_third)) / total_energy)

        # H2: MFCC variance — synthetic speech tends to be unnaturally smooth
        mfcc_var = float(np.mean(np.var(mfcc, axis=1)))
        mfcc_score = 1.0 - min(1.0, mfcc_var / 50.0)

        # H3: Spectral flatness — cloned audio often has unnatural flatness
        flatness = float(
            np.mean(
                librosa.feature.spectral_flatness(
                    S=np.abs(stft) + 1e-10
                )
            )
        )
        flatness_score = min(1.0, flatness * 5.0)

        score = 0.40 * hf_ratio + 0.35 * mfcc_score + 0.25 * flatness_score
        # Tiny perturbation for demo realism
        score += np.random.normal(0, 0.02)
        return float(np.clip(score, 0.0, 1.0))

    # ------------------------------------------------------------------ #
    #  Public API                                                         #
    # ------------------------------------------------------------------ #
    def analyze(self, audio_chunk: np.ndarray) -> dict:
        """
        Run full Spectral ML pipeline on a single 500 ms audio chunk.

        Returns dict with:
          spectral_score  – anomaly probability [0–1]
          stft_shape      – shape of extracted spectrogram
          mfcc_shape      – shape of MFCC feature matrix
        """
        audio = audio_chunk.astype(np.float32)
        peak = np.max(np.abs(audio))
        if peak > 0:
            audio = audio / peak

        features = self.extract_features(audio)

        if self.onnx_session is not None:
            # TODO: real ONNX forward pass
            spectral_score = self._mock_aasist_inference(features)
        else:
            spectral_score = self._mock_aasist_inference(features)

        return {
            "spectral_score": round(spectral_score, 4),
            "stft_shape": list(features["stft_shape"]),
            "mfcc_shape": list(features["mfcc_shape"]),
            "features_extracted": True,
        }
