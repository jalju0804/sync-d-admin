import ProjectCreate from "@/components/page/project/ProjectCreate"; // ProjectCreate 컴포넌트 import
import DefaultTable from "@/components/shared/ui/default-table";
import DefaultTableBtn from "@/components/shared/ui/default-table-btn";
import { Alert, Button, Dropdown, MenuProps, Modal, Popconfirm } from "antd";
import { ColumnsType } from "antd/es/table";
import { saveAs } from "file-saver";
import { Download } from "lucide-react";
import { useRouter } from "next/router";
import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import * as XLSX from "xlsx";
import ProjectSearch from "@/components/page/project/Project-search";
import { useSession } from "next-auth/react";
import moment from "moment";

const ProjectList: React.FC = () => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false); // 모달 상태 변경
  const [editingProject, setEditingProject] = useState<any>(null); // 수정할 프로젝트 데이터 상태
  const [imageModalOpen, setImageModalOpen] = useState(false); // 이미지 모달 상태
  const [imageSrc, setImageSrc] = useState<string>(""); // 확대할 이미지 URL
  const router = useRouter();
  const { data: session } = useSession(); 
  const { name, userId, leftChanceForUserstory, startDate, endDate, progress, userName, page = 1, pageSize = 10 } = router.query;

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = { page: Number(page), pageSize: Number(pageSize) };
    if (name) params.name = String(name);
    if (userId) params.userId = String(userId);
    if (leftChanceForUserstory) params.leftChanceForUserstory = Number(leftChanceForUserstory);
    if (startDate) params.startDate = String(startDate);
    if (endDate) params.endDate = String(endDate);
    if (progress) params.progress = Number(progress);
    if (userName) params.userName = String(userName);
    return params;
  }, [name, userId, leftChanceForUserstory, startDate, endDate, progress, userName, page, pageSize]);

  const queryString = new URLSearchParams(queryParams as any).toString();
  const url = `https://syncd-backend.dev.i-dear.org/admin/project/search?${queryString}`;

  const fetcher = async (url: string) => {
    if (!session) {
      throw new Error("세션이 없습니다.");
    }
    const token = session.user.token;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    return res.json();
  };

  const { data, error, mutate } = useSWR(url, fetcher);

  const handleChangePage = useCallback(
    (pageNumber: number, pageSize?: number) => {
      router.push({
        pathname: router.pathname,
        query: { ...router.query, page: pageNumber, pageSize: pageSize || 10 },
      });
    },
    [router]
  );

  const onSelectChange = useCallback((newSelectedRowKeys: React.Key[]) => {
    setSelectedRowKeys(newSelectedRowKeys);
  }, []);

  const modifyDropdownItems: MenuProps["items"] = useMemo(
    () => [
      {
        key: "statusUpdate",
        label: <a onClick={() => console.log(selectedRowKeys)}>상태 수정</a>,
      },
    ],
    [selectedRowKeys]
  );

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
  };
  const hasSelected = selectedRowKeys.length > 0;

  const handleDelete = useCallback(
    async (projectId: string) => {
      if (!session) {
        console.error("세션이 없습니다.");
        return;
      }
      const token = session? session.user.token : ""
      try {
        const response = await fetch("https://syncd-backend.dev.i-dear.org/admin/project/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ projectId }),
        });

        if (response.ok) {
          mutate(); // 데이터 갱신
        } else {
          console.error("Failed to delete project");
        }
      } catch (error) {
        console.error("An error occurred:", error);
      }
    },
    [mutate, session]
  );

  const handleEdit = (record: any) => {
    setEditingProject(record);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleImageModalClose = () => {
    setImageModalOpen(false);
    setImageSrc("");
  };

  const handleDownloadExcel = async () => {
    if (!session) {
      console.error("세션이 없습니다.");
      return;
    }
    const token = session.user.token;
    try {
      const response = await fetch("https://syncd-backend.dev.i-dear.org/admin/project", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        console.error("Failed to fetch all projects");
        return;
      }

      const allProjects = await response.json();
      const projectsArray = allProjects.projectEntities || allProjects;

      if (!Array.isArray(projectsArray)) {
        console.error("Unexpected data format");
        return;
      }

      const flattenedProjects = projectsArray.map((project: any) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        img: project.img,
        progress: project.progress,
        lastModifiedDate: project.lastModifiedDate,
        leftChanceForUserstory: project.leftChanceForUserstory,
        users: project.users.map((user: any) => user.userId).join(", "), // Join user IDs as a string
      }));

      const worksheet = XLSX.utils.json_to_sheet(flattenedProjects);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");
      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuffer], { type: "application/octet-stream" });

      // 날짜 형식 추가
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const formattedDate = `${year}${month}${day}`;

      saveAs(blob, `syncd_projects_${formattedDate}.xlsx`);
    } catch (error) {
      console.error("An error occurred while downloading the Excel file:", error);
    }
  };

  const parseDate = (dateString: string) => {
    const isoDate = moment(dateString, moment.ISO_8601, true);
    if (isoDate.isValid()) {
      return isoDate.toDate().toLocaleString();
    }
    const alternateDate = moment(dateString, "YYYY-MM-DDTHH:mm:ss.SSSSSSS");
    if (alternateDate.isValid()) {
      return alternateDate.toDate().toLocaleString();
    }
    return dateString; // If parsing fails, return the original string
  };

  const columns: ColumnsType<any> = [
    {
      key: "action",
      width: 120,
      align: "center",
      render: (_value: unknown, record: any) => (
        <span className="flex justify-center gap-2">
          <a onClick={() => handleEdit(record)} className="px-2 py-1 text-sm btn">
            수정
          </a>
          <Popconfirm
            title="프로젝트를 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.id)}
            okText="예"
            cancelText="아니오"
          >
            <a className="px-2 py-1 text-sm btn">삭제</a>
          </Popconfirm>
        </span>
      ),
    },
    {
      title: "프로젝트명",
      dataIndex: "name",
    },
    {
      title: "설명",
      dataIndex: "description",
    },
    {
      title: "이미지",
      dataIndex: "img",
      align: "center",
      render: (value: string) =>
        value ? (
          <img
            src={value}
            alt="project"
            style={{ width: 50, height: 50, cursor: "pointer" }}
            onClick={() => {
              setImageSrc(value);
              setImageModalOpen(true);
            }}
          />
        ) : (
          "없음"
        ),
    },
    {
      title: "진행률",
      dataIndex: "progress",
      align: "center",
      width: 100,
      render: (value: number) => {
        const stages = 12;
        const percentage = (value / stages) * 100;
        return `${percentage.toFixed(2)}% (${value}/${stages})`;
      },
    },
    {
      title: "마지막 수정일",
      dataIndex: "lastModifiedDate",
      align: "center",
      render: (value: string) => parseDate(value),
    },
    {
      title: "남은 기회",
      dataIndex: "leftChanceForUserstory",
      align: "center",
      width: 100,
    },
    {
      title: "사용자",
      dataIndex: "users",
      render: (value: any[]) => {
        return value
          .map((user) => {
            const userDetails = data.userMap[user.userId];
            return userDetails ? userDetails.name : user.userId;
          })
          .join(", ");
      },
    },
  ];

  if (error) {
    return <Alert message="데이터 로딩 중 오류가 발생했습니다." type="warning" />;
  }

  return (
    <>
      <ProjectSearch />
      <DefaultTableBtn className="justify-between">
        <div>
          <span style={{ marginLeft: 8 }}>{hasSelected ? `${selectedRowKeys.length}건 선택` : ""}</span>
        </div>
        <div className="flex-item-list">
          <Button className="btn-with-icon" icon={<Download />} onClick={handleDownloadExcel}>
            엑셀 다운로드
          </Button>
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            프로젝트 등록
          </Button>
        </div>
      </DefaultTableBtn>
      <DefaultTable<any>
        rowSelection={rowSelection}
        columns={columns}
        dataSource={data?.projects || []}
        loading={!data}
        pagination={{
          current: Number(router.query.page || 1),
          defaultPageSize: 5,
          total: data?.totalCount || 0,
          showSizeChanger: true,
          onChange: handleChangePage,
        }}
        className="mt-3"
        countLabel={data?.totalCount}
      />
      <Modal
        title={editingProject ? "프로젝트 수정" : "프로젝트 등록"}
        open={isModalOpen}
        onCancel={handleModalClose}
        footer={null}
      >
        <ProjectCreate project={editingProject} onFinish={mutate} onClose={handleModalClose} />
      </Modal>
      <Modal
        title="이미지 확대"
        open={imageModalOpen}
        onCancel={handleImageModalClose}
        footer={null}
        centered // 모달을 화면 중앙에 배치
      >
        <img src={imageSrc} alt="project enlarged" style={{ width: "100%" }} />
      </Modal>
    </>
  );
};

export default React.memo(ProjectList);
