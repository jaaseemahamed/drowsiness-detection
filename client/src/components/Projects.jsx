import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Briefcase, Clock, CheckCircle2, Trash2, Edit3, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = '/api/projects';

function Projects() {
    const [projects, setProjects] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [formData, setFormData] = useState({ title: '', description: '', status: 'Planning' });

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const response = await axios.get(API_URL);
            setProjects(response.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingProject) {
                await axios.put(`${API_URL}/${editingProject.id}`, formData);
            } else {
                await axios.post(API_URL, formData);
            }
            fetchProjects();
            closeModal();
        } catch (error) {
            console.error('Error saving project:', error);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this project?')) {
            try {
                await axios.delete(`${API_URL}/${id}`);
                fetchProjects();
            } catch (error) {
                console.error('Error deleting project:', error);
            }
        }
    };

    const openModal = (project = null) => {
        if (project) {
            setEditingProject(project);
            setFormData({ title: project.title, description: project.description, status: project.status });
        } else {
            setEditingProject(null);
            setFormData({ title: '', description: '', status: 'Planning' });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProject(null);
        setFormData({ title: '', description: '', status: 'Planning' });
    };

    const stats = [
        { label: 'Total Projects', value: projects.length, icon: <Briefcase size={24} />, color: '#3b82f6' },
        { label: 'Active', value: projects.filter(p => p.status === 'Active').length, icon: <Clock size={24} />, color: '#10b981' },
        { label: 'Completed', value: projects.filter(p => p.status === 'Completed').length, icon: <CheckCircle2 size={24} />, color: '#8b5cf6' },
    ];

    return (
        <div className="projects-container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div className="logo">
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DevFlow</h1>
                </div>
                <button className="add-btn" onClick={() => openModal()}>
                    <Plus size={20} />
                    New Project
                </button>
            </header>

            <div className="stats-grid">
                {stats.map((stat, index) => (
                    <motion.div
                        key={index}
                        className="stat-card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <div className="stat-icon" style={{ color: stat.color }}>{stat.icon}</div>
                        <div className="stat-info">
                            <h3>{stat.label}</h3>
                            <p>{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="projects-grid">
                <AnimatePresence>
                    {projects.map((project) => (
                        <motion.div
                            key={project.id}
                            className="project-card"
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className={`status-badge status-${project.status.toLowerCase()}`}>
                                {project.status}
                            </div>
                            <h2>{project.title}</h2>
                            <p>{project.description}</p>
                            <div className="card-footer">
                                <span className="date">{new Date(project.created_at).toLocaleDateString()}</span>
                                <div className="actions">
                                    <button className="icon-btn edit" onClick={() => openModal(project)}>
                                        <Edit3 size={18} />
                                    </button>
                                    <button className="icon-btn delete" onClick={() => handleDelete(project.id)}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <motion.div
                        className="modal"
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2>{editingProject ? 'Edit Project' : 'Add New Project'}</h2>
                            <button onClick={closeModal} className="icon-btn"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Project Title</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                    placeholder="e.g. Portfolio Website"
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows="3"
                                    placeholder="What are you building?"
                                ></textarea>
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                >
                                    <option value="Planning">Planning</option>
                                    <option value="Active">Active</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="cancel-btn" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="submit-btn">
                                    {editingProject ? 'Save Changes' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

export default Projects;
