import {
  allocateImagesByKind,
  buildImageOrder,
  DEFAULT_IMAGE_ORDER,
  MENU_FIRST_IMAGE_ORDER,
} from "../../modules/assistant/application/image-plan";

const PLAN = {
  deliveryProof: 1,
  menuReference: 2,
  reporter: 2,
  respondent: 2,
  review: 1,
};

describe("image-plan", () => {
  it("mặc định: ưu tiên ảnh bằng chứng của hai bên", () => {
    expect(allocateImagesByKind(PLAN, DEFAULT_IMAGE_ORDER, 4)).toEqual({
      DELIVERY_PROOF: 1,
      REPORTER: 2,
      RESPONDENT: 1,
      MENU_REFERENCE: 0,
      REVIEW: 0,
    });
  });

  it("món trước: ảnh chuẩn món nhận đủ 2 suất trước ảnh hai bên", () => {
    expect(allocateImagesByKind(PLAN, MENU_FIRST_IMAGE_ORDER, 4)).toEqual({
      DELIVERY_PROOF: 1,
      MENU_REFERENCE: 2,
      REPORTER: 1,
      RESPONDENT: 0,
      REVIEW: 0,
    });
  });

  it("không có ảnh / provider báo 0", () => {
    expect(allocateImagesByKind(PLAN, DEFAULT_IMAGE_ORDER, 0)).toEqual({
      DELIVERY_PROOF: 0,
      MENU_REFERENCE: 0,
      REPORTER: 0,
      RESPONDENT: 0,
      REVIEW: 0,
    });
  });

  it("provider báo dư ảnh thì không vượt kế hoạch", () => {
    expect(allocateImagesByKind(PLAN, DEFAULT_IMAGE_ORDER, 99)).toEqual({
      DELIVERY_PROOF: 1,
      REPORTER: 2,
      RESPONDENT: 2,
      MENU_REFERENCE: 2,
      REVIEW: 1,
    });
  });

  it("buildImageOrder trả bản sao đúng thứ tự", () => {
    expect(buildImageOrder(false)).toEqual(DEFAULT_IMAGE_ORDER);
    expect(buildImageOrder(true)).toEqual(MENU_FIRST_IMAGE_ORDER);
    // Không trả về chính mảng hằng (tránh mutate ngoài ý muốn).
    expect(buildImageOrder(true)).not.toBe(MENU_FIRST_IMAGE_ORDER);
  });
});
