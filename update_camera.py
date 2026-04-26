import sqlite3
import os

db_path = os.path.join('server', 'sar.db')
conn = sqlite3.connect(db_path)

# Camera 1 = webcam (already set)
# Cameras 2-4 = set to INACTIVE so worker skips fake RTSP URLs
conn.execute("UPDATE cameras SET status = 'INACTIVE' WHERE camera_id IN (2, 3, 4)")
conn.commit()

rows = conn.execute('SELECT camera_id, name, source_url, status FROM cameras').fetchall()
print('Current cameras:')
for r in rows:
    print(f'  [{r[0]}] {r[1]} | source={r[2]} | status={r[3]}')

conn.close()
print('Done.')
