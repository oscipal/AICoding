import requests
import zipfile
import io

for i in range(1,22):
    if i < 10:
        url = f"http://data.gdeltproject.org/gkg/2026030{i}.gkgcounts.csv.zip"
    else:
        url = f"http://data.gdeltproject.org/gkg/202603{i}.gkgcounts.csv.zip"

    response = requests.get(url)
    response.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        z.extractall("../data/gkgcounts")
