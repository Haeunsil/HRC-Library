import sys
import subprocess

# cryptography 라이브러리 설치 확인 및 자동 설치
try:
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    import datetime
except ImportError:
    print("[INFO] 'cryptography' 라이브러리가 필요합니다. 설치를 진행합니다...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography"])
        print("[INFO] 설치 완료! 다시 실행 중...")
        # 라이브러리 설치 후 재임포트
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import datetime
    except Exception as e:
        print(f"[ERROR] 라이브러리 설치 실패: {e}")
        print("수동으로 설치해 주세요: pip install cryptography")
        sys.exit(1)

def generate_self_signed_cert():
    print("[INFO] 개인키(Private Key) 생성 중...")
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    print("[INFO] 인증서(Certificate) 생성 중...")
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"KR"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Seoul"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, u"Seoul"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"HRC Global"),
        x509.NameAttribute(NameOID.COMMON_NAME, u"webdemo.hrcglobal.com"),
    ])

    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        # 10년 유효
        datetime.datetime.utcnow() + datetime.timedelta(days=3650)
    ).add_extension(
        x509.SubjectAlternativeName([x509.DNSName(u"localhost")]),
        critical=False,
    ).sign(key, hashes.SHA256())

    # key.pem 저장
    print("[INFO] 'key.pem' 저장 중...")
    with open("key.pem", "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # cert.pem 저장
    print("[INFO] 'cert.pem' 저장 중...")
    with open("cert.pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print("\n[SUCCESS] 완료!")
    print("----------------------------------------------------")
    print("1. 생성된 'cert.pem', 'key.pem' 파일을 server.exe와 같은 폴더에 넣으세요.")
    print("2. 서버를 실행하면 HTTPS 모드로 켜집니다.")
    print("3. 브라우저 접속 시 '안전하지 않음' 경고가 뜨면 '고급 -> 안전하지 않음으로 이동'을 누르세요.")
    print("----------------------------------------------------")

if __name__ == "__main__":
    generate_self_signed_cert()
