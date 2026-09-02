import { useEffect, useRef, useState } from 'react';

const SUGGESTED_FOLDER_LABEL = 'Documents/Sublibr';

interface ProjectsFolderSetupProps {
    suggestedFolder: string;
    onConfirm: (folder: string) => void;
}

export function ProjectsFolderSetup({ suggestedFolder, onConfirm }: ProjectsFolderSetupProps) {
    const [folder, setFolder] = useState(suggestedFolder);
    const [choosing, setChoosing] = useState(false);
    const [saving, setSaving] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (suggestedFolder) {
            setFolder(suggestedFolder);
            return;
        }
        const api = window.electronAPI;
        if (!api?.getDefaultProjectsFolder) return;
        api.getDefaultProjectsFolder().then((path) => {
            if (path) setFolder(path);
        }).catch(() => {});
    }, [suggestedFolder]);

    useEffect(() => {
        modalRef.current?.focus();
    }, []);

    const handleChangeFolder = async () => {
        const api = window.electronAPI;
        if (!api) return;
        setChoosing(true);
        try {
            const pick = api.pickProjectsFolder ?? api.chooseProjectsFolder;
            const picked = pick ? await pick() : null;
            if (picked) setFolder(picked);
        } finally {
            setChoosing(false);
        }
    };

    const handleContinue = async () => {
        const api = window.electronAPI;
        if (!api?.confirmProjectsFolder) return;
        setSaving(true);
        try {
            const confirmed = await api.confirmProjectsFolder(folder);
            onConfirm(confirmed);
        } finally {
            setSaving(false);
        }
    };

    const displayPath = folder || SUGGESTED_FOLDER_LABEL;

    return (
        <div className="settings-overlay setup-overlay">
            <div
                className="settings-modal setup-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="setup-title"
                ref={modalRef}
                tabIndex={-1}
            >
                <div className="settings-header">
                    <h2 id="setup-title">Choose a projects folder</h2>
                </div>
                <div className="settings-content">
                    <p className="settings-tab-intro">
                        Each project lives here as its own folder, with media copied in so you can open it on another computer. API keys are never saved here. You can change this later in Settings.
                    </p>
                    <div className="projects-folder-row">
                        <code className="projects-folder-path" title={displayPath}>
                            {displayPath}
                        </code>
                        <button
                            type="button"
                            className="btn-secondary projects-folder-btn"
                            onClick={handleChangeFolder}
                            disabled={choosing || saving}
                        >
                            Change folder
                        </button>
                    </div>
                </div>
                <div className="settings-footer">
                    <button
                        className="btn-primary"
                        onClick={handleContinue}
                        disabled={saving}
                    >
                        Use this folder
                    </button>
                </div>
            </div>
        </div>
    );
}
