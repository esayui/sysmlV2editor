import { useState, useEffect } from 'react';
import { Button, Input, Modal, List, message, Empty, Space, Typography, Popconfirm } from 'antd';
import {
  FolderOpenOutlined, PlusOutlined, ProjectOutlined,
  ReloadOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons';
import { apiClient } from '../api/client';

const { Title, Text } = Typography;

interface ProjectEntry {
  name: string;
  path: string;
  created: string;
  modified: string;
}

interface ProjectPageProps {
  onEnterProject: (projectName: string, projectPath: string) => void;
}

export default function ProjectPage({ onEnterProject }: ProjectPageProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDir, setNewProjectDir] = useState('');
  const [creating, setCreating] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectEntry | null>(null);
  const [editName, setEditName] = useState('');

  const defaultDir = 'E:/sysml2/projects';

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/project/list');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        if (data.projects?.length === 0) {
          message.info('工程列表为空，请新建工程');
        }
      }
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  const handleCreate = async () => {
    if (!newProjectName.trim()) { message.warning('请输入工程名称'); return; }
    const dir = newProjectDir.trim() || defaultDir;
    setCreating(true);
    try {
      await apiClient.createProject(dir, newProjectName.trim());
      message.success(`工程 "${newProjectName}" 创建成功`);
      setCreateModalOpen(false);
      setNewProjectName('');
      await loadProjects();
      const projectPath = `${dir}/${newProjectName.trim()}/${newProjectName.trim()}.sysml2proj`;
      onEnterProject(newProjectName.trim(), projectPath);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally { setCreating(false); }
  };

  const handleOpenProject = async (project: ProjectEntry) => {
    try {
      await apiClient.openProject(project.path);
      onEnterProject(project.name, project.path);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '打开失败，工程目录可能已被移动');
    }
  };

  const handleDelete = async (project: ProjectEntry) => {
    try {
      const res = await fetch('/api/v1/project/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
      if (res.ok) {
        message.success(`已移除 "${project.name}"`);
        setProjects((prev) => prev.filter((p) => p.path !== project.path));
      }
    } catch {
      message.error('删除失败');
    }
  };

  const handleEditStart = (project: ProjectEntry) => {
    setEditProject(project);
    setEditName(project.name);
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editProject || !editName.trim()) return;
    try {
      const res = await fetch('/api/v1/project/rename', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editProject.path, new_name: editName.trim() }),
      });
      if (res.ok) {
        message.success('已重命名');
        setEditModalOpen(false);
        setProjects((prev) =>
          prev.map((p) => (p.path === editProject.path ? { ...p, name: editName.trim() } : p)),
        );
      }
    } catch { message.error('重命名失败'); }
  };

  const filteredProjects = searchText.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(searchText.toLowerCase()))
    : projects;

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-CN'); }
    catch { return iso; }
  };

  return (
    <div className="project-page">
      <div className="project-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <ProjectOutlined style={{ marginRight: 8 }} />
            SysML v2 Modeler
          </Title>
          <Text type="secondary">基于模型的系统工程 (MBSE) 建模工具</Text>
        </div>
        <Space>
          <Input
            placeholder="搜索工程..." prefix={<SearchOutlined />}
            value={searchText} onChange={(e) => setSearchText(e.target.value)}
            allowClear style={{ width: 200 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadProjects} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            新建工程
          </Button>
        </Space>
      </div>

      <div className="project-page-body">
        <Title level={5} style={{ marginBottom: 16 }}>
          工程列表 ({filteredProjects.length}{searchText ? ` / ${projects.length}` : ''})
        </Title>
        {filteredProjects.length === 0 ? (
          <Empty description={searchText ? '未找到匹配的工程' : '暂无工程，请点击「新建工程」创建'} />
        ) : (
          <List
            loading={loading}
            dataSource={filteredProjects}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="open" type="link" icon={<FolderOpenOutlined />}
                    onClick={() => handleOpenProject(item)}>打开</Button>,
                  <Button key="edit" type="link" icon={<EditOutlined />}
                    onClick={() => handleEditStart(item)}>编辑</Button>,
                  <Popconfirm key="del" title="确定移除此工程？不会删除磁盘文件"
                    onConfirm={() => handleDelete(item)} okText="移除" cancelText="取消">
                    <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<ProjectOutlined style={{ fontSize: 24, color: '#1677FF' }} />}
                  title={item.name}
                  description={
                    <span>创建: {formatDate(item.created)} | 修改: {formatDate(item.modified)}</span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>

      {/* 新建工程 Modal */}
      <Modal title="新建工程" open={createModalOpen}
        onOk={handleCreate} onCancel={() => { setCreateModalOpen(false); setNewProjectName(''); }}
        confirmLoading={creating} okText="创建" cancelText="取消">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          <div>
            <Text strong>工程名称</Text>
            <Input placeholder="例如: MySystem" value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong>工程目录（留空则使用默认目录）</Text>
            <Input placeholder={defaultDir} value={newProjectDir}
              onChange={(e) => setNewProjectDir(e.target.value)} style={{ marginTop: 4 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>默认目录: {defaultDir}</Text>
          </div>
        </div>
      </Modal>

      {/* 编辑工程 Modal */}
      <Modal title="编辑工程" open={editModalOpen}
        onOk={handleEditSave} onCancel={() => setEditModalOpen(false)}
        okText="保存" cancelText="取消">
        <div style={{ paddingTop: 8 }}>
          <Text strong>工程名称</Text>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)}
            onPressEnter={handleEditSave} style={{ marginTop: 4 }} autoFocus />
        </div>
      </Modal>
    </div>
  );
}
