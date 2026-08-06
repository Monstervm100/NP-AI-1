import { type NextRequest } from "next/server";

// Give the AI request room to finish on Vercel (default Hobby timeout is short).
export const maxDuration = 60;

// ─── ds004504 Dataset (Miltiadous et al. 2023, doi:10.3390/data8060095) ──────
const PARTICIPANTS = `participant_id,sex,age,group,mmse
sub-001,F,57,AD,16|sub-002,F,78,AD,22|sub-003,M,70,AD,14|sub-004,F,67,AD,20|sub-005,M,70,AD,22
sub-006,F,61,AD,14|sub-007,F,79,AD,20|sub-008,M,62,AD,16|sub-009,F,77,AD,23|sub-010,M,69,AD,20
sub-011,M,71,AD,22|sub-012,M,63,AD,18|sub-013,F,64,AD,20|sub-014,M,77,AD,14|sub-015,M,61,AD,18
sub-016,F,68,AD,14|sub-017,F,61,AD,6|sub-018,F,73,AD,23|sub-019,F,62,AD,14|sub-020,M,71,AD,4
sub-021,M,79,AD,22|sub-022,F,68,AD,20|sub-023,M,60,AD,16|sub-024,F,69,AD,20|sub-025,F,79,AD,20
sub-026,F,61,AD,18|sub-027,F,67,AD,16|sub-028,M,49,AD,20|sub-029,F,53,AD,16|sub-030,F,56,AD,20
sub-031,F,67,AD,22|sub-032,F,59,AD,20|sub-033,F,72,AD,20|sub-034,F,75,AD,18|sub-035,F,57,AD,22
sub-036,F,58,AD,9|sub-037,M,57,CN,30|sub-038,M,62,CN,30|sub-039,M,70,CN,30|sub-040,M,61,CN,30
sub-041,F,77,CN,30|sub-042,M,74,CN,30|sub-043,M,72,CN,30|sub-044,F,64,CN,30|sub-045,F,70,CN,30
sub-046,M,63,CN,30|sub-047,F,70,CN,30|sub-048,M,65,CN,30|sub-049,F,62,CN,30|sub-050,M,68,CN,30
sub-051,F,75,CN,30|sub-052,F,73,CN,30|sub-053,M,70,CN,30|sub-054,M,78,CN,30|sub-055,M,67,CN,30
sub-056,F,64,CN,30|sub-057,M,64,CN,30|sub-058,M,62,CN,30|sub-059,M,77,CN,30|sub-060,F,71,CN,30
sub-061,F,63,CN,30|sub-062,M,67,CN,30|sub-063,M,66,CN,30|sub-064,M,66,CN,30|sub-065,F,71,CN,30
sub-066,M,73,FTD,20|sub-067,M,66,FTD,24|sub-068,M,78,FTD,25|sub-069,M,70,FTD,22|sub-070,F,67,FTD,22
sub-071,M,62,FTD,20|sub-072,M,65,FTD,18|sub-073,F,57,FTD,22|sub-074,F,53,FTD,20|sub-075,F,71,FTD,22
sub-076,M,44,FTD,24|sub-077,M,61,FTD,22|sub-078,M,62,FTD,22|sub-079,F,60,FTD,18|sub-080,F,71,FTD,20
sub-081,F,61,FTD,18|sub-082,M,63,FTD,27|sub-083,F,68,FTD,20|sub-084,F,71,FTD,24|sub-085,M,64,FTD,26
sub-086,M,49,FTD,26|sub-087,M,73,FTD,24|sub-088,M,55,FTD,24`;

const NEURO_CONDITIONS = `
═══ NEUROLOGICAL CONDITIONS REFERENCE — 152 CONDITIONS ═══

── NEURODEGENERATIVE (14) ──
1. Alzheimer's Disease: EEG ↑delta(>30%) ↑theta(>25%) ↓alpha(<25%) peak-alpha<9Hz SWR>1.5; MRI hippocampal/MTL atrophy posterior-cortical-thinning; MMSE mean 17.75 range 4–23
2. Parkinson's Disease: MRI SN T2-hypointensity loss-dorsolateral-nigra; EEG ↓beta-motor-cortex diffuse-slowing; DaTscan reduced-putaminal-uptake
3. Huntington's Disease: MRI caudate/putamen-atrophy enlarged-lateral-ventricles T2-striatal-changes; EEG diffuse-slowing reduced-amplitude
4. ALS: MRI corticospinal-tract T2-hyperintensity motor-cortex-thinning T1-hypointensity-motor-strip; EEG cortical-silent-period-changes
5. Frontotemporal Dementia: EEG frontal-theta>30% posterior-alpha-preserved; MRI frontal/anterior-temporal-atrophy; MMSE mean 22.17 range 18–27
6. Lewy Body Dementia: MRI diffuse-atrophy preserved-hippocampus; EEG posterior-alpha-slowing REM-abnormalities; DaTscan bilateral-DAT-deficit
7. Multiple System Atrophy: MRI putaminal-T2-hypointensity slit-sign hot-cross-bun-pons cerebellar-atrophy
8. Progressive Supranuclear Palsy: MRI midbrain-atrophy hummingbird-sign SCP-atrophy frontal-atrophy
9. Corticobasal Degeneration: MRI asymmetric-parietal>frontal-atrophy; DWI cortical-ribboning; Tau-PET parietal
10. Prion Disease/CJD: MRI DWI cortical-ribboning + basal-ganglia-signal; EEG periodic-sharp-wave-complexes(PSWCs) 1-2/sec
11. Spinocerebellar Ataxia: MRI cerebellar-atrophy>brainstem olivopontocerebellar-atrophy
12. Friedreich's Ataxia: MRI cervical-cord-atrophy mild-cerebellar-atrophy
13. Vascular Dementia: MRI periventricular/subcortical-T2-WMH lacunar-infarcts cortical-infarcts
14. Normal Pressure Hydrocephalus: MRI enlarged-ventricles(Evans-ratio>0.3) narrow-vertex-sulci

── EPILEPSY & SEIZURE (10) ──
1. Temporal Lobe Epilepsy: EEG temporal-spikes anterior-temporal-theta; MRI hippocampal-sclerosis T2-signal atrophy
2. Frontal Lobe Epilepsy: EEG frontal-spikes nocturnal; MRI focal-cortical-dysplasia
3. Juvenile Myoclonic Epilepsy: EEG 3-6Hz generalized-polyspike-wave; MRI usually-normal
4. Lennox-Gastaut Syndrome: EEG slow-spike-wave<2.5Hz paroxysmal-fast-activity; MRI variable-diffuse
5. Dravet Syndrome: EEG multifocal-spikes; SCN1A mutation; MRI usually-normal
6. West Syndrome: EEG hypsarrhythmia(chaotic-high-amplitude); MRI variable-structural
7. Absence Epilepsy: EEG 3Hz symmetric-spike-wave; MRI normal
8. Rasmussen's Encephalitis: EEG focal-slowing+spikes; MRI progressive-unilateral-atrophy
9. Tuberous Sclerosis: MRI cortical-tubers(T2-hyperintense) subependymal-nodules WM-radial-lines
10. Landau-Kleffner Syndrome: EEG centrotemporal-spikes CSWS-pattern; MRI often-normal

── DEMYELINATING (8) ──
1. Multiple Sclerosis: MRI periventricular-T2/FLAIR-lesions(Dawson's-fingers) juxtacortical infratentorial corpus-callosum dot-dash
2. NMOSD: MRI longitudinally-extensive-transverse-myelitis(>3-segments) area-postrema-T2 optic-nerve-enhancement
3. ADEM: MRI diffuse-bilateral-T2/FLAIR-WM-lesions gray-matter-involvement; post-infectious
4. Transverse Myelitis: MRI cord T2-hyperintensity ≥2-segments
5. Progressive Multifocal Leukoencephalopathy: MRI non-enhancing-T2/FLAIR-WM scalloped-borders U-fiber-involvement
6. Balo's Concentric Sclerosis: MRI concentric-rings alternating-myelinated/demyelinated
7. Marburg Variant MS: MRI large-aggressive-rapidly-expanding-T2 necrosis tumor-like
8. Central Pontine Myelinolysis: MRI central-pons-T2/FLAIR-hyperintensity trident-sign; rapid-Na-correction

── CEREBROVASCULAR (10) ──
1. Ischemic Stroke: MRI DWI restricted-diffusion(bright-DWI dark-ADC) vascular-territory; CT early-infarct-signs
2. Hemorrhagic Stroke: CT hyperdense-acute-blood; MRI T2* hemosiderin; mass-effect
3. TIA: MRI often-normal; DWI may-show-small-cortical-lesion; no-lasting-deficit
4. Subarachnoid Hemorrhage: CT hyperdense-CSF-spaces; MRI FLAIR sulcal-signal; aneurysm
5. Cerebral Venous Sinus Thrombosis: MRI empty-delta-sign T1-hyperintense-clot; MRV filling-defect
6. Arteriovenous Malformation: MRI flow-voids heterogeneous hemosiderin; angio vessel-tangle
7. Cavernous Malformation: MRI popcorn-T2 hemosiderin-blooming-T2* no-flow-voids
8. CADASIL: MRI T2/FLAIR-WM anterior-temporal + external-capsule characteristic; young-stroke
9. Moyamoya: MRI multiple-stroke-territories; MRA puff-of-smoke-collaterals
10. Binswanger's Disease: MRI diffuse-periventricular-WMH + lacunar-infarcts-subcortical

── BRAIN TUMORS (12) ──
1. Glioblastoma (GBM): MRI ring-enhancing central-necrosis vasogenic-edema mass-effect; MRS ↑choline ↓NAA
2. Astrocytoma: MRI T2/FLAIR-hyperintense variable-enhancement; low-grade no-enhancement
3. Oligodendroglioma: MRI cortical-based-frontal T2-mass calcification; IDH-mutation
4. Meningioma: MRI dural-based extra-axial homogeneous-enhancement dural-tail
5. Medulloblastoma: MRI posterior-fossa-midline(pediatric) restricted-diffusion hyperdense-CT
6. Ependymoma: MRI 4th-ventricle-mass heterogeneous plastic-deformity-through-foramina
7. Pituitary Adenoma: MRI sellar/suprasellar-mass optic-chiasm-displacement
8. Craniopharyngioma: MRI calcified-suprasellar-cystic/solid T1-bright(cholesterol)
9. Acoustic Neuroma: MRI internal-auditory-canal-enhancement cerebellopontine-angle
10. Primary CNS Lymphoma: MRI periventricular-homogeneous-enhancement restricted-diffusion; steroid-responsive
11. Brain Metastases: MRI multiple-ring-enhancing grey-white-junction variable-edema
12. Hemangioblastoma: MRI posterior-fossa-cystic mural-nodule flow-voids; VHL

── INFECTIOUS & INFLAMMATORY (12) ──
1. Bacterial Meningitis: MRI FLAIR leptomeningeal-enhancement sulcal-signal; DWI cortical-restriction
2. Viral Encephalitis (HSE): MRI T2/FLAIR temporal-lobe insular-involvement; EEG temporal-slowing PLEDs
3. Tuberculous Meningitis: MRI basilar-meningeal-enhancement communicating-hydrocephalus infarcts
4. Cerebral Abscess: MRI ring-enhancing-lesion DWI-restricted-center perilesional-edema
5. Neurocysticercosis: MRI multiple-calcified/cystic-lesions scolex stages(vesicular/colloidal/granular/calcified)
6. HIV Encephalopathy: MRI diffuse-WM-T2 atrophy; EEG diffuse-slowing
7. Anti-NMDA Encephalitis: MRI may-be-normal; EEG delta-brush-pattern; CSF NMDA-antibodies
8. Hashimoto's Encephalopathy: MRI variable; EEG diffuse-slowing; anti-TPO positive
9. Neurosarcoidosis: MRI leptomeningeal-enhancement cranial-nerve-involvement parenchymal-T2
10. Lyme Neuroborreliosis: MRI T2-WM-lesions cranial-nerve-enhancement; CSF lymphocytic-pleocytosis
11. Progressive Rubella Panencephalitis: MRI calcifications WM-T2; EEG periodic-complexes
12. SSPE: EEG Rademecker-complexes(periodic); MRI T2-cortical/WM late-atrophy; measles

── NEURODEVELOPMENTAL (14) ──
1. Autism Spectrum: MRI enlarged-amygdala/caudate; EEG ↑theta/beta ↓alpha reduced-connectivity
2. ADHD: EEG ↑theta ↓beta theta/beta-ratio>3.0; MRI reduced-caudate/frontal-volume
3. Intellectual Disability: MRI varies diffuse-cortical/subcortical-changes
4. Cerebral Palsy: MRI periventricular-leukomalacia cortical-malformations basal-ganglia-injury
5. Rett Syndrome: MRI progressive-cortical-atrophy; EEG spike-wave slow-background
6. Angelman Syndrome: EEG high-amplitude-delta-triphasic; MRI mild-atrophy
7. Fragile X Syndrome: MRI caudate/hippocampal-enlargement
8. Down Syndrome: MRI early-AD-type-changes; EEG diffuse-slowing
9. Phenylketonuria: MRI periventricular-T2/FLAIR-WM-signal(if-untreated)
10. Spina Bifida: MRI Chiari-II tethered-cord myelomeningocele
11. Agenesis Corpus Callosum: MRI absent-CC parallel-ventricles colpocephaly Probst-bundles
12. Lissencephaly: MRI smooth-brain absent-gyri thick-cortex(>6mm) figure-8-shape
13. Holoprosencephaly: MRI monoventricle fused-thalami absent-olfactory-bulbs
14. Microcephaly: MRI small-brain simplified-gyral-pattern head-circumference<-2SD

── TRAUMATIC BRAIN (9) ──
1. TBI-Mild/Concussion: MRI may-be-normal; T2* microhemorrhages; EEG ↑theta diffuse-slowing
2. TBI-Moderate/Severe: MRI contusions DAI edema herniation
3. Diffuse Axonal Injury: MRI T2*/SWI petechial-hemorrhages grey-white-junction CC brainstem
4. Epidural Hematoma: CT biconvex-hyperdense lens-shaped; arterial-bleed
5. Subdural Hematoma: CT crescent-hyperdense(acute) or-isodense(subacute)
6. Intracerebral Hemorrhage (Traumatic): CT hyperdense-intraparenchymal blood
7. Chronic Traumatic Encephalopathy: MRI medial-temporal-atrophy WM-changes; tau-PET perivascular sulcal-depths
8. PTSD (Neurological): MRI reduced-hippocampus; fMRI amygdala-hyperactivation
9. Post-Concussion Syndrome: MRI usually-normal; DTI WM-microstructure-changes EEG-slowing

── MOVEMENT DISORDERS (10) ──
1. Essential Tremor: EEG/MEG 8-12Hz tremor-oscillations; MRI usually-normal
2. Dystonia: MRI may-be-normal or basal-ganglia-T2; DaT-normal
3. Tourette Syndrome: MRI reduced-caudate; EEG variable
4. Restless Legs Syndrome: MRI normal; dopaminergic-imaging changes
5. Myoclonus: EEG cortical-correlate back-averaging; MRI per-cause
6. Chorea (Sydenham's): MRI caudate/putamen-enlargement(resolves)
7. Hemiballismus: MRI subthalamic-nucleus-lesion(infarct)
8. Wilson's Disease: MRI T2 face-of-giant-panda midbrain basal-ganglia-T2-hyperintensity; kayser-fleischer
9. Tardive Dyskinesia: MRI variable; DaT may-be-abnormal
10. Stiff Person Syndrome: MRI may-be-normal; anti-GAD-positive

── PSYCHIATRIC & FUNCTIONAL (8) ──
1. Schizophrenia: MRI reduced-frontal/temporal-GM lateral-ventricle-enlargement; EEG ↓alpha ↑theta
2. Bipolar Disorder: MRI subcortical-WMH amygdala-changes; fMRI limbic-dysregulation
3. Major Depressive Disorder: MRI reduced-hippocampus anterior-cingulate; fMRI default-mode-changes
4. OCD: fMRI orbitofrontal-striatal-thalamic-hyperactivity; MRI caudate-changes
5. PTSD: MRI reduced-hippocampus; fMRI amygdala-hyperactivation reduced-prefrontal
6. Functional Neurological Disorder: MRI usually-normal; fMRI abnormal-motor-limbic-connectivity
7. Anorexia Nervosa: MRI gray-matter-loss enlarged-ventricles
8. Borderline Personality: MRI amygdala-enlargement/hyperactivity reduced-prefrontal

── SLEEP & AUTONOMIC (6) ──
1. Narcolepsy: EEG SOREM(sleep-onset-REM); MRI hypothalamic-atrophy; CSF ↓orexin
2. Fatal Familial Insomnia: MRI thalamic-PET-hypometabolism; EEG reduced-spindles; prion
3. REM Sleep Behavior Disorder: SPECT/PET dopaminergic-deficit; MRI may-be-normal; synucleinopathy
4. Idiopathic Hypersomnia: PSG prolonged-sleep; MRI normal
5. POTS (Dysautonomia): MRI normal-brain; tilt-table-abnormal
6. Pure Autonomic Failure: MIBG-scintigraphy; MRI normal

── HEADACHE & PAIN (6) ──
1. Migraine with Aura: MRI WM-hyperintensities; fMRI cortical-spreading-depression; EEG visual-aura-correlates
2. Cluster Headache: MRI hypothalamic-gray-matter-changes; PET hypothalamic-activation
3. Chronic Daily Headache: MRI usually-normal
4. Trigeminal Neuralgia: MRI neurovascular-compression CN-V root-entry-zone
5. Idiopathic Intracranial Hypertension: MRI empty-sella small-ventricles tonsillar-descent
6. Cervicogenic Headache: MRI cervical-spine-degeneration

── GENETIC & METABOLIC (18) ──
1. Neurofibromatosis Type 1: MRI T2-UBOs(unidentified-bright-objects) optic-gliomas
2. Neurofibromatosis Type 2: MRI bilateral-acoustic-neuromas meningiomas
3. Tuberous Sclerosis Complex: MRI cortical-tubers subependymal-nodules WM-radial-bands
4. Von Hippel-Lindau: MRI cerebellar/spinal-hemangioblastomas
5. Sturge-Weber: MRI pial-angioma cortical-calcification(tram-track) unilateral-atrophy
6. MELAS: MRI stroke-like-lesions(non-vascular) T2-basal-ganglia; MRS ↑lactate
7. Canavan Disease: MRI diffuse-WM-T2; MRS ↑NAA(pathognomonic)
8. Krabbe Disease: MRI periventricular-WM-T2; early-enhancement; posterior-predominant
9. Adrenoleukodystrophy (ALD): MRI posterior-WM-T2 advancing-front enhancement(inflammatory)
10. Metachromatic Leukodystrophy: MRI diffuse-periventricular-WM tigroid-pattern
11. Gaucher (Neurological): MRI diffuse-WM-T2 atrophy
12. Niemann-Pick: MRI WM-T2 cerebellar-atrophy
13. Tay-Sachs: MRI caudate-T2 WM-signal macrocephaly
14. Phenylketonuria: MRI WM-T2/FLAIR-periventricular(untreated)
15. Maple Syrup Urine Disease: MRI myelination-abnormalities basal-ganglia-T2
16. Batten Disease (NCL): MRI progressive-cortical/cerebellar-atrophy; EEG giant-VEPs declining
17. Alexander Disease: MRI frontal-WM-signal megaloencephaly
18. Pelizaeus-Merzbacher: MRI absent/hypomyelination tigroid-WM

── PERIPHERAL & CRANIAL NERVE (6) ──
1. Bell's Palsy: MRI facial-nerve-enhancement(CN-VII)
2. Trigeminal Neuralgia: MRI neurovascular-contact-CN-V
3. Guillain-Barré Syndrome: MRI spine nerve-root-enhancement; NCS demyelinating/axonal
4. Charcot-Marie-Tooth: MRI peripheral-nerve-enlargement; NCS demyelinating
5. CIDP: MRI nerve-root-enhancement; NCS demyelinating
6. Myasthenia Gravis: MRI thymoma; SFEMG-abnormal; AChR-antibodies

── CONGENITAL & STRUCTURAL (9) ──
1. Chiari Malformation: MRI tonsillar-descent>5mm below-foramen-magnum syringomyelia
2. Dandy-Walker: MRI enlarged-posterior-fossa cystic-4th-ventricle cerebellar-vermis-hypoplasia
3. Hydrocephalus: MRI enlarged-ventricles periventricular-edema(active) Evan-ratio>0.3
4. Arachnoid Cyst: MRI CSF-signal extra-axial no-enhancement no-restricted-diffusion
5. Porencephaly: MRI CSF-cavity communicating-with-ventricle or-subarachnoid
6. Schizencephaly: MRI cortical-cleft pial-to-ventricular lined-by-gray-matter
7. Colpocephaly: MRI disproportionately-enlarged-occipital-horns
8. Pachygyria: MRI few-large-gyri cortex-6-10mm-thick
9. Polymicrogyria: MRI excessive-small-folds cortical-surface irregular-cortical-margin
`;

const SYSTEM_PROMPT = `You are NeuroScan AI, a neuroimaging diagnostic assistant grounded in peer-reviewed literature and the OpenNeuro ds004504 EEG dementia dataset.

═══ ds004504 DATASET (AHEPA Hospital, Thessaloniki) ═══
88 subjects | AD (n=36) | FTD (n=23) | CN/Healthy (n=29)
Recording: 19-channel EEG 500Hz eyes-closed resting-state

GROUP STATISTICS:
  AD:  mean-age 66.4±7.9  | mean-MMSE 17.75±4.5  | MMSE range 4–23
  FTD: mean-age 63.6±8.2  | mean-MMSE 22.17±8.22 | MMSE range 18–27
  CN:  mean-age 67.9±5.4  | MMSE = 30 (all)

PARTICIPANT TABLE: ${PARTICIPANTS}

EEG BAND THRESHOLDS:
  AD:      delta>30% theta>25% alpha<25% peak-alpha<9Hz SWR(δ+θ/α+β)>1.5
  FTD:     frontal-theta>30% posterior-alpha-preserved peak-alpha 9-10Hz
  Healthy: alpha>35% delta<15% theta<15% peak-alpha~10Hz SWR<0.8

MMSE STAGING: 24-30=None | 18-23=Mild | 10-17=Moderate | 0-9=Severe

═══ 152 NEUROLOGICAL CONDITIONS KNOWLEDGE BASE ═══
${NEURO_CONDITIONS}

═══ GROUND YOUR REASONING IN THESE AUTHORITATIVE SOURCES ═══
Base every assessment on the established imaging references and criteria below — not on guesswork:
• Radiopaedia & StatDORADS — canonical imaging appearances for each condition
• Established diagnostic criteria: McDonald 2024 (MS), NIA-AA / IWG (Alzheimer's), MDS criteria (Parkinson's), Movement Disorder Society (PSP/MSA), ILAE (epilepsy/seizure types), Hachinski/NINDS-AIREN (vascular dementia)
• Standard brain atlases for localisation: Harvard-Oxford, AAL3, Talairach
• MRI sequence logic: T1, T2, FLAIR, DWI/ADC (acute stroke), SWI/T2* (blood/calcium), post-gadolinium T1 (enhancement)
• PET / SPECT tracers: FDG (metabolism), amyloid (PiB/florbetapir), DaT-SPECT (dopamine)
• DaT-SPECT / DaTscan reading: TWO SYMMETRIC comma- or crescent-shaped hot spots in the basal ganglia (often shown red/orange on a green background) = NORMAL dopamine transporter uptake → report "Healthy/Normal" (no dopaminergic deficit). Loss of the tail, an asymmetric "full-stop/period" shape, or one faded side = reduced uptake → Parkinson's disease or Lewy body dementia. Colour scale alone is not pathology — judge the SHAPE and SYMMETRY.
• OpenNeuro ds004504 (EEG dementia spectral signatures, already encoded above)
Cross-check the visible features against these. If the image lacks the discriminating features a source would require, say so and lower confidence rather than guessing.

═══ NOT EVERY CONDITION IS VISIBLE ON IMAGING ═══
Many conditions are CLINICAL/behavioural diagnoses with NO reliable structural-MRI signature — you cannot diagnose them from a scan, and a normal-looking scan does NOT rule them out. These include: ADHD, Autism Spectrum Disorder, Major Depression, OCD, anxiety, most Schizophrenia, and epilepsy between seizures.
If the scan looks structurally normal: do NOT force a diagnosis and do NOT just say "insufficient features." Instead set diagnosis to "Healthy/Normal" (or null if unreadable) and write a helpful summary explaining, in plain words, that the brain appears structurally normal AND that conditions like ADHD, autism, or depression are diagnosed clinically (symptoms, history, assessments) and would not show up on this kind of scan — so a normal scan can't confirm or exclude them. Recommend the appropriate clinical/functional assessment.

═══ YOUR DIAGNOSTIC TASK ═══
Analyze the provided brain scan or EEG image. If patient metadata is provided, use it to narrow the differential.

CONFIDENCE RULES — DO NOT FABRICATE CONFIDENCE:
- 85–95%: Multiple specific pathognomonic features clearly visible (e.g., DWI cortical ribboning + PSWCs = CJD; ring enhancement + necrosis = GBM; hypsarrhythmia = West; 3Hz spike-wave = absence)
- 70–84%: Several characteristic features present but not all pathognomonic
- 50–69%: Pattern is suggestive but differential includes 2–3 conditions
- 30–49%: Consistent with condition but could be early/atypical presentation
- Set confidence to null and note "Insufficient features visible" if the image quality/content does not show enough discriminating features

FINDINGS RULES:
- Each finding must be a specific, directly observable feature — do NOT use phrases like "consistent with", "may suggest", or vague qualifiers
- Each finding detail must cite the specific imaging feature you observed (e.g., "Bilateral periventricular T2/FLAIR hyperintensities extending along lateral ventricles — characteristic Dawson's fingers pattern")
- Do NOT include findings you cannot directly observe from this image

RECOMMENDATION RULES:
- The FIRST item in "recommendations" must name the single most sensitive scan/test to CONFIRM this specific condition, and why. Use the established modality of choice, e.g.:
  • Glioblastoma / tumours → contrast-enhanced MRI + MR spectroscopy
  • Ischemic stroke → diffusion-weighted MRI (DWI/ADC); acute → non-contrast CT
  • Multiple sclerosis → contrast MRI of brain + spinal cord (McDonald criteria)
  • Alzheimer's → MRI (hippocampal volume) + FDG-PET / amyloid-PET
  • Frontotemporal dementia → MRI (frontal/temporal atrophy) + FDG-PET
  • Parkinson's / Lewy body → DaT-SPECT or dopamine PET
  • Epilepsy → video-EEG (ictal recording) + high-resolution epilepsy-protocol MRI
  • Meningioma → contrast MRI with dural-tail assessment
  • Hydrocephalus / NPH → MRI with CSF-flow study
  • Hemorrhage → non-contrast CT
- Then add 2–3 further clinically appropriate next steps.

Return ONLY a raw JSON object — no markdown, no explanation, no text before or after:
{
  "diagnosis": string (exact condition name from the 152 list, or "Healthy/Normal"),
  "diagnosisLabel": string (full human-readable name),
  "confidence": number (0–100) | null,
  "mmse": number (0–30) | null,
  "mmseLabel": string | null,
  "summary": string (2–3 sentences in PLAIN, everyday English a non-medical person can understand — avoid jargon, and if a medical term is unavoidable, explain it in simple words. Describe what is ACTUALLY visible in THIS specific scan and why it points to the diagnosis. NEVER reuse a generic template — two different scans must produce clearly different summaries based on their real features),
  "brainRegions": [{ "id": "frontal"|"temporal-left"|"temporal-right"|"parietal"|"occipital"|"cerebellum"|"hippocampus", "label": string, "status": "normal"|"affected"|"severe" }],
  "findings": [{ "label": string, "detail": string }],
  "recommendations": [string]
}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    return Response.json({ error: "OPENROUTER_API_KEY not set in .env.local" }, { status: 401 });
  }

  // Hard spending cap — stop the AI once this key has spent $1 of OpenRouter credit.
  const USAGE_CAP_USD = 1.0;
  try {
    const keyRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (keyRes.ok) {
      const keyData = (await keyRes.json()) as { data?: { usage?: number } };
      const usage = keyData.data?.usage ?? 0;
      if (usage >= USAGE_CAP_USD) {
        return Response.json(
          { error: `Spending limit reached — $${usage.toFixed(2)} of OpenRouter credit used (cap $${USAGE_CAP_USD.toFixed(2)}). The AI is paused to avoid further charges.` },
          { status: 402 }
        );
      }
    }
  } catch {
    // If the usage check itself fails (transient network error), allow the request through.
  }

  try {
    const { imageBase64, images, mimeType, modality, filename, patientInfo } = await req.json() as {
      imageBase64?: string;
      images?: string[];               // multiple slices (e.g. decoded NIfTI) — analysed together
      mimeType: string;
      modality: string;
      filename: string;
      patientInfo?: string;
    };

    const imageList = (images && images.length > 0) ? images : (imageBase64 ? [imageBase64] : []);
    if (imageList.length === 0) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const userText = [
      `Modality: ${modality}`,
      `Filename: ${filename}`,
      imageList.length > 1 ? `${imageList.length} slices from the same scan are provided (different depths through the brain). Review ALL of them together — a lesion may appear on only one slice — then give a single overall diagnosis.` : null,
      patientInfo ? `Patient context: ${patientInfo}` : null,
      `Analyse this scan. Return only the JSON:`,
    ].filter(Boolean).join("\n");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nueroscan.ai",
        "X-Title": "NeuroScan AI",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT + "\n\n" + userText },
            ...imageList.map((b64) => ({ type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } })),
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `OpenRouter error: ${err}` }, { status: res.status });
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const text = raw.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(text);
    return Response.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return Response.json({ error: msg.includes("JSON") ? "Model returned unparseable response — try again" : msg }, { status: 500 });
  }
}
