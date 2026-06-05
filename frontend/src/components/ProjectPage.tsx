import { useState, useEffect } from 'react';
import { Button, Input, Modal, List, message, Empty, Space, Typography } from 'antd';
import {
  FolderOpenOutlined,
  PlusOutlined,
  ProjectOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { apiClient } from '../api/client';

const { Title, Text } = Typography;

interface ProjectEntry {
  name: string;
  path: string;
  modified: string;
}

interface ProjectPageProps {
  onEnterProject: (projectName: string, projectPath: string) => void;
}

export default function ProjectPage({ onEnterProject }: ProjectPageProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDir, setNewProjectDir] = useState('');
  const [creating, setCreating] = useState(false);

  // 默认项目目录
  const defaultDir = 'E:/sysml2/projects';

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/project/list');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async () => {
    if (!newProjectName.trim()) {
      message.warning('请输入工程名称');
      return;
    }
    const dir = newProjectDir.trim() || defaultDir;
    setCreating(true);
    try {
      await apiClient.createProject(dir, newProjectName.trim());
      message.success(`工程 "${newProjectName}" 创建成功`);
      setCreateModalOpen(false);
      setNewProjectName('');
      const projectPath = `${dir}/${newProjectName.trim()}/${newProjectName.trim()}.sysml2proj`;
      onEnterProject(newProjectName.trim(), projectPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败';
      message.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenProject = async (project: ProjectEntry) => {
    try {
      await apiClient.openProject(project.path);
      onEnterProject(project.name, project.path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '打开失败';
      message.error(msg);
    }
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
          <Button icon={<ReloadOutlined />} onClick={loadProjects} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            新建工程
          </Button>
        </Space>
      </div>

      <div className="project-page-body">
        <Title level={5} style={{ marginBottom: 16 }}>
          最近工程
        </Title>
        {projects.length === 0 ? (
          <Empty description="暂无工程，请点击「新建工程」创建" />
        ) : (
          <List
            loading={loading}
            dataSource={projects}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="open"
                    type="link"
                    icon={<FolderOpenOutlined />}
                    onClick={() => handleOpenProject(item)}
                  >
                    打开
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<ProjectOutlined style={{ fontSize: 24, color: '#1677FF' }} />}
                  title={item.name}
                  description={`最后修改: ${item.modified}`}
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <Modal
        title="新建工程"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalOpen(false);
          setNewProjectName('');
        }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          <div>
            <Text strong>工程名称</Text>
            <Input
              placeholder="例如: MySystem"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>工程目录（留空则使用默认目录）</Text>
            <Input
              placeholder={defaultDir}
              value={newProjectDir}
              onChange={(e) => setNewProjectDir(e.target.value)}
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              默认目录: {defaultDir}
            </Text>
          </div>
        </div>
      </Modal>
    </div>
  );
}
