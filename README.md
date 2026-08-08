# NP-AI-1

NP-AI-1 is a web app for exploring neuroimaging and brain-signal data. You upload a brain scan or an EEG recording, and it returns a plain-language report describing what the data shows and, where possible, which neurological condition the patterns are most consistent with.

## What it does

- **Reads many formats.** Standard images (PNG, JPEG, WebP), NIfTI volumes (`.nii` / `.nii.gz`), DICOM slices (`.dcm`), zipped scan folders, and EEG recordings (`.edf`, EEGLAB `.set`).
- **Analyzes brain scans.** MRI, PET, and CT images are examined by a vision AI model that describes the visible anatomy and flags findings across a large set of neurological conditions.
- **Analyzes EEG signals.** Recordings are processed with signal analysis (FFT, band powers, peak alpha frequency) to characterize the brain's rhythmic activity.
- **Reports honestly.** When a condition cannot be seen in the data provided (for example, a disorder that does not appear on a structural MRI), the report says so instead of guessing.

## What it is not

NP-AI-1 is a research and educational tool, not a medical device. It does not provide a diagnosis and is not a substitute for evaluation by a qualified clinician. Its scan analysis relies on a general-purpose vision model rather than a system trained on labeled clinical scans, so results are exploratory and should never be used to make health decisions.

## How it works

The app is built with Next.js and TypeScript. Uploaded files are parsed in the browser, then handed to the appropriate analysis path: scan images go to a vision model for interpretation, while EEG files are run through hand-written signal-processing code. The result is assembled into a readable report shown in the interface.
