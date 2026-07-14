"""Deploy employee-seating-dashboard to workai-05 via paramiko SFTP."""
import os
import paramiko

HOST = os.environ.get("SEATING_DEPLOY_HOST", "workai-05.mr-group.ru")
USER = os.environ.get("SEATING_DEPLOY_USER", "userai-05")
PASS = os.environ.get("SEATING_DEPLOY_PASS")
REMOTE_BASE = "/home/userai-05/employee-seating"
PORT_NUM = 8004

if not PASS:
    raise SystemExit(
        "Set the SSH password via env var before deploying:\n"
        "  PowerShell:  $env:SEATING_DEPLOY_PASS = '...'\n"
        "  bash:        export SEATING_DEPLOY_PASS='...'"
    )

LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))
LOCAL_HTML = os.path.join(LOCAL_BASE, "employee-seating-dashboard.html")

START_SH = """\
#!/bin/bash
cd {remote}
nohup python3 -m http.server {port} > /tmp/employee-seating.log 2>&1 &
echo $! > /tmp/employee-seating.pid
echo "Started on port {port}, pid $(cat /tmp/employee-seating.pid)"
""".format(remote=REMOTE_BASE, port=PORT_NUM)

STOP_SH = """\
#!/bin/bash
if [ -f /tmp/employee-seating.pid ]; then
  kill $(cat /tmp/employee-seating.pid) 2>/dev/null
  rm /tmp/employee-seating.pid
  echo "Stopped"
else
  echo "Not running"
fi
"""


def ensure_remote_dir(sftp, remote_path):
    parts = remote_path.split("/")
    current = ""
    for part in parts:
        if not part:
            continue
        current = current + "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_text(sftp, content, remote_path):
    import io
    encoded = content.encode("utf-8")
    sftp.putfo(io.BytesIO(encoded), remote_path)


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    ensure_remote_dir(sftp, REMOTE_BASE)

    print("Uploading index.html...")
    sftp.put(LOCAL_HTML, REMOTE_BASE + "/index.html")
    print("  OK  index.html")

    print("Uploading start.sh / stop.sh...")
    upload_text(sftp, START_SH, REMOTE_BASE + "/start.sh")
    upload_text(sftp, STOP_SH, REMOTE_BASE + "/stop.sh")
    sftp.chmod(REMOTE_BASE + "/start.sh", 0o755)
    sftp.chmod(REMOTE_BASE + "/stop.sh", 0o755)
    print("  OK  start.sh, stop.sh")

    sftp.close()

    print("\nRestarting service...")
    cmd = "bash {r}/stop.sh 2>/dev/null; sleep 1; bash {r}/start.sh".format(r=REMOTE_BASE)
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("STDERR:", err)

    ssh.close()
    print("Done. URL: http://workai-05.mr-group.ru:{port}".format(port=PORT_NUM))


if __name__ == "__main__":
    main()
