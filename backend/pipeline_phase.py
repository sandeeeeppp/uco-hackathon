"""
Pipeline B: The Mathematical Phase Gatekeeper
==============================================
Exploits the physical impossibility of Generative AI perfectly
reconstructing acoustic phase. Pure math — no ML model needed.

Flow:
  Raw Audio → Hilbert Transform → Analytic Signal
    → Instantaneous Frequency (IF) → frame-boundary stitch detection
    → Chirp Group Delay (CGD)    → high-resolution anomaly mapping
"""

import numpy as np
from scipy.signal import hilbert
from scipy.fft import fft


class PhaseForensicsPipeline:
    """
    Generative voice tools optimize almost entirely to mimic the
    magnitude spectrum (volume & pitch). They treat acoustic phase
    as an afterthought, digitally guessing or reconstructing it —
    which inherently leaves behind microscopic, persistent
    discontinuities that this pipeline detects.
    """

    def __init__(self, sr: int = 16000):
        self.sr = sr
        # IF jitter threshold (Hz) — max expected for natural speech
        self.if_jitter_threshold = 500.0
        # CGD anomaly threshold (normalized)
        self.cgd_anomaly_threshold = 0.15

    # ------------------------------------------------------------------ #
    #  Step 1 — Hilbert Transform → Analytic Signal                      #
    # ------------------------------------------------------------------ #
    def compute_analytic_signal(self, audio: np.ndarray) -> np.ndarray:
        """
        Convert raw audio into an Analytic Signal by shifting frequency
        components by 90°. This lets us mathematically derive the
        instantaneous phase and its derivatives without relying on AI.
        """
        return hilbert(audio)

    # ------------------------------------------------------------------ #
    #  Step 2 — Instantaneous Frequency (IF)                             #
    # ------------------------------------------------------------------ #
    def compute_instantaneous_frequency(
        self, analytic_signal: np.ndarray
    ) -> np.ndarray:
        """
        Genuine human speech is physically fluid → mathematically smooth,
        continuous IF trajectories.

        We hunt for erratic, jerky IF fluctuations that occur at the
        frame boundaries where generative vocoders forcefully stitch
        discrete audio windows together.
        """
        instantaneous_phase = np.unwrap(np.angle(analytic_signal))
        # IF = dφ/dt  /  2π  ×  sample_rate
        if_values = np.diff(instantaneous_phase) / (2.0 * np.pi) * self.sr
        return if_values

    def _score_if_discontinuities(self, if_values: np.ndarray) -> float:
        """Score frame-boundary stitching artefacts via IF jitter."""
        if len(if_values) < 2:
            return 0.0

        jitter = np.abs(np.diff(if_values))
        # Fraction of jitter spikes exceeding natural threshold
        anomalous_frac = float(np.sum(jitter > self.if_jitter_threshold)) / len(
            jitter
        )
        # Overall IF variance (synthetic tends to be noisier)
        variance_score = min(1.0, float(np.std(if_values)) / (self.sr / 4.0))

        return float(np.clip(0.6 * anomalous_frac + 0.4 * variance_score, 0, 1))

    # ------------------------------------------------------------------ #
    #  Step 3 — Chirp Group Delay (CGD)                                  #
    # ------------------------------------------------------------------ #
    def compute_chirp_group_delay(
        self, audio: np.ndarray, r: float = 0.98
    ) -> np.ndarray:
        """
        Standard phase calculations suffer from 'phase wrapping artifacts'
        creating visual noise. We solve this by computing CGD strictly
        outside the unit circle (r < 1) to compensate for the natural
        exponential decay of sound.

        Yields an extraordinarily high-resolution map of synthetic
        anomalies that deepfakes cannot hide.
        """
        n = len(audio)
        n_range = np.arange(n, dtype=np.float64)

        # Exponential weighting outside unit circle
        r_pow = r ** n_range
        weighted = audio * r_pow
        weighted_n = audio * n_range * r_pow

        X = fft(weighted)
        Y = fft(weighted_n)

        # CGD = Re{ Y / X }, with numerical guard
        epsilon = 1e-10
        cgd = np.real(Y / (X + epsilon))
        return cgd

    def _score_cgd_anomalies(self, cgd: np.ndarray) -> float:
        """Score CGD irregularity — synthetic speech shows erratic patterns."""
        if len(cgd) < 4:
            return 0.0

        half = len(cgd) // 2
        cgd_half = cgd[:half]

        cgd_diff = np.abs(np.diff(cgd_half))
        max_val = np.max(np.abs(cgd_half)) + 1e-10
        anomalous_frac = float(
            np.sum(cgd_diff > self.cgd_anomaly_threshold * max_val)
        ) / len(cgd_diff)

        mean_abs = float(np.mean(np.abs(cgd_half))) + 1e-10
        regularity = float(np.std(cgd_half)) / mean_abs
        regularity_score = min(1.0, regularity / 5.0)

        return float(np.clip(0.5 * anomalous_frac + 0.5 * regularity_score, 0, 1))

    # ------------------------------------------------------------------ #
    #  Public API                                                         #
    # ------------------------------------------------------------------ #
    def analyze(self, audio_chunk: np.ndarray) -> dict:
        """
        Run full Phase Forensics pipeline on a single 500 ms audio chunk.

        Returns dict with:
          if_score   – Instantaneous Frequency discontinuity score  [0–1]
          cgd_score  – Chirp Group Delay anomaly score              [0–1]
          phase_score – Combined score (0 = human, 1 = synthetic)   [0–1]
        """
        audio = audio_chunk.astype(np.float64)
        peak = np.max(np.abs(audio))
        if peak > 0:
            audio = audio / peak

        # 1) Analytic signal
        analytic = self.compute_analytic_signal(audio)

        # 2) Instantaneous Frequency
        if_values = self.compute_instantaneous_frequency(analytic)
        if_score = self._score_if_discontinuities(if_values)

        # 3) Chirp Group Delay
        cgd = self.compute_chirp_group_delay(audio)
        cgd_score = self._score_cgd_anomalies(cgd)

        # Weighted combination
        phase_score = 0.55 * if_score + 0.45 * cgd_score

        return {
            "if_score": round(if_score, 4),
            "cgd_score": round(cgd_score, 4),
            "phase_score": round(phase_score, 4),
            "if_mean_hz": round(float(np.mean(np.abs(if_values))), 2),
            "if_std_hz": round(float(np.std(if_values)), 2),
        }
