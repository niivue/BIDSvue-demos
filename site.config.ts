/**
 * Site-wide configuration for the BIDSvue demos site.
 *
 * The Markdown in this repo stays plain and GitHub-native. Everything the
 * static-site build needs that *isn't* prose — the hero copy, the ordered
 * list of tutorials, the tool grid, external links — lives here so the
 * content files never carry frontmatter or build-only markup.
 */

export type Tutorial = {
  /** Folder name; also the URL path (e.g. `mri-reproin-1/`). */
  slug: string
  /** Card + page title. */
  title: string
  /** One-line card summary. */
  summary: string
  /** Short chips shown on the card (modality, format, …). */
  tags: string[]
  /** Rough time-to-complete, shown on the card. */
  duration: string
}

export type Tool = {
  name: string
  href: string
  blurb: string
}

export type SiteConfig = {
  title: string
  tagline: string
  /** Longer description for the home page's meta / social preview (not shown). */
  intro: string
  /** URL of the app / project the demos are for. */
  appUrl: string
  /** Where to download installers. */
  releasesUrl: string
  /** Default accent applied before the user picks one. */
  defaultAccent: string
  tutorials: Tutorial[]
  tools: Tool[]
}

const config: SiteConfig = {
  title: 'BIDSvue',
  tagline: 'Create, curate, de-identify, and share BIDS datasets.',
  intro:
    'BIDSvue transforms raw neuroimaging data into curated archives that you can explore to fix errors, strip identifiable features, and publish to the cloud.',
  appUrl: 'https://github.com/niivue/BIDSvue',
  releasesUrl: 'https://github.com/niivue/BIDSvue/releases',
  defaultAccent: 'orange',

  tutorials: [
    {
      slug: 'mri-reproin-1',
      title: 'Convert ReproIn MRI to BIDS',
      summary:
        'Turn a folder of ReproIn-named DICOMs into a validated, de-identified, ' +
        'shareable BIDS dataset.',
      tags: ['MRI', 'DICOM', 'De-identify', 'Share'],
      duration: '~15 min',
    },
    {
      slug: 'meg-mne-1',
      title: 'From MEG to BIDS',
      summary:
        'Use the MNE-BIDS plug-in to create, edit, and share a BIDS dataset.',
      tags: ['MEG', 'MNE-BIDS', 'De-identify', 'Share'],
      duration: '~15 min',
    },
    {
      slug: 'pet-pet2bids-1',
      title: 'Convert PET to BIDS',
      summary:
        'Use PET2BIDS to create, edit, and share a BIDS dataset.',
      tags: ['PET', 'PET2BIDS', 'Edit', 'Share'],
      duration: '~15 min',
    },
    {
      slug: 'datalad-1',
      title: 'Explore a DataLad dataset',
      summary:
        'Clone a huge remote dataset and fetch only the files you need.',
      tags: ['DataLad', 'Clone', 'Timeseries', 'Dashboard'],
      duration: '~15 min',
    },
    {
      slug: 'mrs-dcm-1',
      title: 'View MRS',
      summary:
        'Convert Magnetic Resonance Spectroscopy (MRS) DICOMs and read the metabolite peaks in the spectrum.',
      tags: ['MRS', 'DICOM', 'Spectra'],
      duration: '~15 min',
    },
    {
      slug: 'mri-physio-1',
      title: 'Embedded physiological recordings',
      summary:
        'Import and inspect physiological measures acquired with MRI.',
      tags: ['MRI', 'DICOM', 'Physio', 'AI'],
      duration: '~15 min',
    },
  ],

  tools: [
    {
      name: 'dcm2niix',
      href: 'https://github.com/rordenlab/dcm2niix',
      blurb: 'DICOM → NIfTI/BIDS conversion, including ReproIn naming.',
    },
    {
      name: 'bids-validator-rs',
      href: 'https://github.com/rordenlab/bids-validator-rs',
      blurb: 'A fast Rust implementation of the BIDS validator.',
    },
    {
      name: 'niimath',
      href: 'https://github.com/rordenlab/niimath',
      blurb: 'CPU defacing and the mindgrab mask-dilation pass.',
    },
    {
      name: 'mindgrab',
      href: 'https://github.com/neuroneural/brainchop',
      blurb: 'Brainchop model powering robust brain extraction.',
    },
    {
      name: 'NiiVue',
      href: 'https://niivue.com/',
      blurb: 'WebGL neuroimaging visualization for the preview pane.',
    },
    {
      name: 'DataLad',
      href: 'https://github.com/rordenlab/datalad-rs',
      blurb: 'Distributed datasets via a native, in-binary datalad-rs engine.',
    },
    {
      name: 'Dcm2Bids',
      href: 'https://github.com/UNFmontreal/Dcm2Bids',
      blurb: 'Configurable DICOM-to-BIDS organization.',
    },
    {
      name: 'heudiconv',
      href: 'https://github.com/nipy/heudiconv',
      blurb: 'Heuristic-driven DICOM conversion.',
    },
    {
      name: 'mne-bids',
      href: 'https://github.com/mne-tools/mne-bids',
      blurb: 'MEG / EEG / fNIRS import (.fif / .edf / .bdf / .snirf).',
    },
    {
      name: 'ezbids',
      href: 'https://github.com/brainlife/ezbids',
      blurb: 'MEG-to-BIDS conversion.',
    },
    {
      name: 'PET2BIDS',
      href: 'https://github.com/openneuropet/PET2BIDS',
      blurb: 'Import PET data into BIDS.',
    },
  ],
}

export default config
