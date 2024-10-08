import { UserDocType } from '../firebase_doctypes';
import { pastPapersCol, uploadBlobToFirestore } from '../firebase';
import { fileToBlob } from '../util';
import { PastPaperDocType } from './types';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

interface UploadProps {
  file: File | null;
  currUser: UserDocType;
  subject_name: string;
  confidence: number;
  examType: string;
  visibility: boolean;
}

interface UpdateProps {
  file: File | null;
  subject_name: string;
  examType: string;
  visibility: boolean;
  uid: string;
  confidence?: number;
}

export async function updatePastPaper({
  file,
  subject_name,
  examType,
  visibility,
  uid,
  confidence
}: UpdateProps) {
  let photoUrl = undefined;
  if (file) {
    photoUrl = await uploadBlobToFirestore(fileToBlob(file));
  }
  const docRef = doc(pastPapersCol, uid);

  const docData: Partial<PastPaperDocType> = {
    subject_name,
    visibility,
    exam_type: examType,
    upload_at: serverTimestamp(),
    ...(photoUrl === undefined ? {} : { photo_url: photoUrl, confidence })
  };

  await updateDoc(docRef, docData);
}

export default async function uploadPastPaper({
  file,
  subject_name,
  currUser,
  confidence,
  examType,
  visibility
}: UploadProps) {
  if (!file) return;

  try {
    const photo_url = await uploadBlobToFirestore(fileToBlob(file));

    const docRef = doc(pastPapersCol);
    const docData: PastPaperDocType = {
      photo_url,
      uid: docRef.id,
      exam_type: examType,
      subject_name,
      visibility,
      upload_at: serverTimestamp(),
      uploader: {
        displayName: currUser.displayName,
        photoURL: currUser.photoURL,
        uid: currUser.uid
      },
      votes_count: 0,
      uploader_uid: currUser.uid,
      confidence,
      isLocked: false,
      deleted: false,
      spam: false
    };

    await setDoc(docRef, docData);
  } catch (err) {
    return false;
  }

  return true;
}
