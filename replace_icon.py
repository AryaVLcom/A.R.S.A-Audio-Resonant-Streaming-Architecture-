import os, shutil

source_img = r'd:\Programminig\ARSA V2\Convx\app_icons\icon-1024(2).png'
res_dir = r'd:\Programminig\ARSA V2\Convx\app\src\main\res'

for folder in os.listdir(res_dir):
    if folder.startswith('mipmap'):
        folder_path = os.path.join(res_dir, folder)
        for file in os.listdir(folder_path):
            if file == 'ic_launcher.png' or file == 'ic_launcher_foreground.png' or file == 'ic_launcher_round.png' or file == 'ic_launcher_monochrome.png':
                shutil.copy(source_img, os.path.join(folder_path, file))

