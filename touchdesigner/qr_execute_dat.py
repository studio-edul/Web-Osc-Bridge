import socket
import os

def get_local_ip():
	try:
		s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		s.connect(('8.8.8.8', 80))
		ip = s.getsockname()[0]
		s.close()
		return ip
	except Exception as e:
		print(f'[WOB] IP 감지 실패: {e}')
		return '127.0.0.1'

def onStart():
	print('[WOB] onStart triggered')
	generate()

def generate():
	print('[WOB] generate() 시작')

	# 1. qrcode import
	try:
		import qrcode
		print('[WOB] qrcode import 성공')
	except Exception as e:
		print(f'[WOB] qrcode import 실패: {e}')
		print('[WOB] TD Python에 설치 필요:')
		print('[WOB]   "C:/Program Files/Derivative/TouchDesigner/bin/python.exe" -m pip install qrcode')
		return

	# 2. IP 감지
	ip = get_local_ip()
	url = f'https://{ip}:9980'
	print(f'[WOB] IP: {ip}')
	print(f'[WOB] URL: {url}')
	op('wob_url_text').par.text = url


	# 3. QR 생성
	try:
		qr = qrcode.QRCode(box_size=10, border=4)
		qr.add_data(url)
		qr.make(fit=True)
		img = qr.make_image(fill_color='black', back_color='white')
		print('[WOB] QR 이미지 생성 성공')
	except Exception as e:
		print(f'[WOB] QR 생성 실패: {e}')
		return

	# 4. 파일 저장
	try:
		save_path = os.path.join(project.folder, 'qr.png')
		print(f'[WOB] 저장 경로: {save_path}')
		img.save(save_path)
		print(f'[WOB] 파일 저장 성공: {os.path.exists(save_path)}')
	except Exception as e:
		print(f'[WOB] 파일 저장 실패: {e}')
		return

	# 5. Movie File In TOP 갱신
	try:
		movie_top = op('qr_movie_top')
		if movie_top is None:
			print('[WOB] qr_movie_top 노드를 찾을 수 없음 — 노드 이름 확인 필요')
			return
		print(f'[WOB] qr_movie_top 노드 찾음: {movie_top}')
		movie_top.par.file = save_path
		movie_top.par.reloadpulse.pulse()
		print('[WOB] TOP 갱신 완료')
	except Exception as e:
		print(f'[WOB] TOP 갱신 실패: {e}')
		return

	print('[WOB] generate() 완료')
