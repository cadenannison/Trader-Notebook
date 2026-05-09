import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def derive_key(master_key_hex: str, user_id: str) -> bytes:
    """Derive a per-user 32-byte AES key using HKDF-SHA256.

    The key is derived deterministically from the master key and user ID.
    It is never written to disk or the database — only held in memory during a request.
    """
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
