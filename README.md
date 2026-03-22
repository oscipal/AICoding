# AI-Assisted Coding and Collaborative Project Development | Spring 2026

## Setup

### Repository

Clone the repository:

```bash
git clone https://github.com/oscipal/AICoding.git
cd AICoding
```

### Dependencies

Create a conda environment, then install the dependencies:

```bash
conda create --name aicoding --file requirements.txt
conda activate aicoding
```

After installing new dependencies update requirements.txt:

```bash
conda list -e > requirements.txt
```

### Pushing to repo

After setting up the repo on your workstation, create a new branch and push changes to that:

```bash
git checkout -b <branch>
git add .
git commit <commit message>
git push -u origin <branch> 
```

## Data Links

https://www.gdeltproject.org/
http://data.gdeltproject.org/gkg/index.html