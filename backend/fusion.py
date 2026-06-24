"""
Fusion Engine — Dual-Phase Verdict
===================================
Fuses Spectral ML (Pipeline A) and Phase Forensics (Pipeline B)
scores using a weighted combination.

Produces three-tier classification:
  HUMAN  ·  SUSPICIOUS  ·  AI_MANIPULATED
each with a confidence percentage.
"""


class FusionEngine:
    """
    Weighted score fusion + three-tier threat classification.

    Default weights: 60 % spectral · 40 % phase
    Thresholds calibrated against ASVspoof 2019 LA t-DCF curves.
    """

    # ---- Classification thresholds ----
    HUMAN_THRESHOLD = 0.35
    SUSPICIOUS_THRESHOLD = 0.65

    # ---- Default pipeline weights ----
    DEFAULT_SPECTRAL_WEIGHT = 0.6
    DEFAULT_PHASE_WEIGHT = 0.4

    def __init__(
        self,
        spectral_weight: float | None = None,
        phase_weight: float | None = None,
    ):
        if spectral_weight is not None and phase_weight is not None:
            total = spectral_weight + phase_weight
            self.spectral_w = spectral_weight / total
            self.phase_w = phase_weight / total
        elif spectral_weight is not None:
            self.spectral_w = spectral_weight
            self.phase_w = 1.0 - spectral_weight
        else:
            self.spectral_w = self.DEFAULT_SPECTRAL_WEIGHT
            self.phase_w = self.DEFAULT_PHASE_WEIGHT

    def fuse(self, spectral_score: float, phase_score: float) -> dict:
        """
        Combine pipeline scores into a final verdict.

        Parameters
        ----------
        spectral_score : float  – Pipeline A anomaly score [0–1]
        phase_score    : float  – Pipeline B anomaly score [0–1]

        Returns
        -------
        dict with fused_score, verdict, confidence, risk_level, weights
        """
        fused = self.spectral_w * spectral_score + self.phase_w * phase_score
        fused = round(fused, 4)

        if fused < self.HUMAN_THRESHOLD:
            verdict = "HUMAN"
            risk_level = "LOW"
        elif fused < self.SUSPICIOUS_THRESHOLD:
            verdict = "SUSPICIOUS"
            risk_level = "MEDIUM"
        else:
            verdict = "AI_MANIPULATED"
            risk_level = "HIGH"

        # Confidence = distance from the decision boundary (0.5), scaled 0–100 %
        confidence = round(abs(fused - 0.5) * 2.0 * 100.0, 1)

        return {
            "fused_score": fused,
            "verdict": verdict,
            "confidence": confidence,
            "risk_level": risk_level,
            "weights": {
                "spectral": self.spectral_w,
                "phase": self.phase_w,
            },
        }
