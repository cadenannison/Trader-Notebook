import os
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_HEX_64 = re.compile(r"\A[0-9a-fA-F]{64}\Z")


class MasterKeyError(RuntimeError):
    """MASTER_KEY is missing or not a 64-character hex string."""


def master_key_is_valid(master_key_hex: str) -> bool:
    return bool(master_key_hex) and bool(_HEX_64.fullmatch(master_key_hex))


def derive_key(master_key_hex: str, user_id: str) -> bytes:
    """Derive a per-user 32-byte AES key using HKDF-SHA256.

    The key is derived deterministically from the master key and user ID.
    It is never written to disk or the database — only held in memory during a request.
    """
    # bytes.fromhex would otherwise raise a cryptic "non-hexadecimal number
    # found", which surfaces as an opaque 500 on every note read/write. A
    # randomly generated secret (e.g. Render's `generateValue`) is not hex and
    # silently breaks all encryption, so fail with something actionable.
    if not master_key_is_valid(master_key_hex):
        raise MasterKeyError(
            "MASTER_KEY must be a 64-character hex string (32 bytes). "
            "Generate one with `openssl rand -hex 32` and set it in the server environment."
        )
    master_key = bytes.fromhex(master_key_hex)
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=user_id.encode(),
    )
    return hkdf.derive(master_key)


def encrypt(plaintext: str, key: bytes) -> bytes:
    """Encrypt a string with AES-256-GCM. Returns 12-byte nonce prepended to ciphertext."""
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return nonce + ciphertext


def decrypt(ciphertext: bytes, key: bytes) -> str:
    """Decrypt AES-256-GCM ciphertext. Expects the 12-byte nonce prepended."""
    nonce = ciphertext[:12]
    data = ciphertext[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, data, None).decode()
