import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '../types';
import { formatTimeAgo } from '../utils';

interface LatestProjectsProps {
    projects: ProjectSummary[];
    onLoadProject: (project: ProjectSummary) => void;
    onDuplicateProject: (project: ProjectSummary) => void;
    onRenameProject: (project: ProjectSummary) => void;
    onRequestDelete: (project: ProjectSummary) => void;
    highlightedIndex: number | null;
}

export function LatestProjects({
    projects,
    onLoadProject,
    onDuplicateProject,
    onRenameProject,
    onRequestDelete,
    highlightedIndex,
}: LatestProjectsProps) {
    const [menuDir, setMenuDir] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuDir) return;
        const onPointerDown = (e: PointerEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            setMenuDir(null);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuDir(null);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuDir]);

    if (projects.length === 0) return null;

    return (
        <div className="recent-files">
            <div className="recent-files-header-row">
                <h3 className="recent-files-header">Latest projects</h3>
            </div>
            <div className="recent-files-list" role="list" aria-label="Latest projects">
                {projects.map((project, index) => {
                    const menuOpen = menuDir === project.dir;
                    return (
                        <div
                            key={project.dir}
                            className={`recent-file-item ${highlightedIndex === index ? 'highlighted' : ''} ${menuOpen ? 'menu-open' : ''}`}
                            role="listitem"
                        >
                            <button
                                className="recent-file-open"
                                onClick={() => onLoadProject(project)}
                                title={project.dir}
                            >
                                <div className="recent-file-icon">
                                    <span className="icon icon-sm">{project.missingMedia ? 'link_off' : 'movie'}</span>
                                </div>
                                <div className="recent-file-info">
                                    <div className="recent-file-name">{project.name}</div>
                                    <div className="recent-file-meta">
                                        {formatTimeAgo(project.updatedAt)}
                                        {project.mediaName && ` • ${project.mediaName}`}
                                        {project.subtitleCount > 0 && (
                                            <span className="recent-file-cached"> • {project.subtitleCount} subtitles</span>
                                        )}
                                        {project.missingMedia && (
                                            <span className="recent-file-missing"> • Missing media</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                            <div className="recent-file-menu" ref={menuOpen ? menuRef : undefined}>
                                <button
                                    className="recent-file-menu-btn"
                                    type="button"
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-label={`Options for ${project.name}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuDir(menuOpen ? null : project.dir);
                                    }}
                                >
                                    <span className="icon icon-sm">more_vert</span>
                                </button>
                                {menuOpen && (
                                    <div className="recent-file-menu-list" role="menu">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuDir(null);
                                                onLoadProject(project);
                                            }}
                                        >
                                            <span className="icon icon-sm">folder_open</span>
                                            Open project
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuDir(null);
                                                onRenameProject(project);
                                            }}
                                        >
                                            <span className="icon icon-sm">drive_file_rename_outline</span>
                                            Rename
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                setMenuDir(null);
                                                onDuplicateProject(project);
                                            }}
                                        >
                                            <span className="icon icon-sm">content_copy</span>
                                            Duplicate
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="is-danger"
                                            onClick={() => {
                                                setMenuDir(null);
                                                onRequestDelete(project);
                                            }}
                                        >
                                            <span className="icon icon-sm">delete</span>
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export { LatestProjects as RecentFiles };
