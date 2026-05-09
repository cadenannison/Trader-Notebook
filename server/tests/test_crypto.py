import pytest

from app.crypto.keys import decrypt, derive_key, encrypt

MOCK_MASTER_KEY = "a" * 64  # 32 bytes as hex


def test_derive_key_is_deterministic():
    key1 = derive_key(MOCK_MASTER_KEY, "user-123")
    key2 = derive_key(MOCK_MASTER_KEY, "user-123")
    assert key1 == key2


def test_derive_key_differs_by_user():
    key1 = derive_key(MOCK_MASTER_KEY, "user-123")
    key2 = derive_key(MOCK_MASTER_KEY, "user-456")
    assert key1 != key2


def test_encrypt_decrypt_roundtrip():
    key = derive_key(MOCK_MASTER_KEY, "user-123")
    plaintext = "NVDA is looking strong heading into earnings."
    ciphertext = encrypt(plaintext, key)
    assert decrypt(ciphertext, key) == plaintext


def test_ciphertext_does_not_contain_plaintext():
    key = derive_key(MOCK_MASTER_KEY, "user-123")
    plaintext = "secret trading note"
    ciphertext = encrypt(plaintext, key)
    assert plaintext.encode() not in ciphertext


def test_different_encryptions_of_same_plaintext_differ():
    """AES-GCM uses a random nonce so the same plaintext produces different ciphertext."""
    key = derive_key(MOCK_MASTER_KEY, "user-123")
    plaintext = "same note"
    assert encrypt(plaintext, key) != encrypt(plaintext, key)


def test_wrong_key_raises():
    key1 = derive_key(MOCK_MASTER_KEY, "user-123")
    key2 = derive_key(MOCK_MASTER_KEY, "user-456")
    ciphertext = encrypt("secret", key1)
    with pytest.raises(Exception):
        decrypt(ciphertext, key2)
