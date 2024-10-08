import {
  Box,
  Button,
  Center,
  FormControl,
  FormHelperText,
  FormLabel,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Input,
  Text,
  VisuallyHidden,
  Switch,
  useToast,
  HStack,
  useMediaQuery,
  Modal,
  ModalOverlay,
  ModalContent,
  Stack
} from '@chakra-ui/react';

import React, { useReducer, useRef, useState, useCallback, useEffect } from 'react';

import Image from 'next/image';

import {
  AutoComplete,
  AutoCompleteInput,
  AutoCompleteItem,
  AutoCompleteList,
  Item
} from '@choc-ui/chakra-autocomplete';

import Tesseract from 'tesseract.js';
import Loader from '../design/Loader';
import useAllSubjects from '~/hooks/useAllSubjects';
import { FaCamera, FaImages } from 'react-icons/fa';
import Webcam from 'react-webcam';
import { dataURLtoFile } from '~/lib/util';
import { useUserCredentials } from '~/hooks/hooks';
import upload, { updatePastPaper } from '~/lib/pastpaper/upload';
import { PastPaperDocType } from '~/lib/pastpaper/types';

const UploadModal = ({
  isOpen,
  onClose,
  defaultData
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultData: PastPaperDocType | null;
}) => {
  const [loading, setLoading] = useState({
    validatingImage: false,
    uploading: false
  });

  const [user] = useUserCredentials();

  const [isWebcamOpen, setIsWebcamOpen] = useState(false);

  const toast = useToast();
  const subjects = useAllSubjects();

  const inputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const [selectedFile, setSelectedFile] = useState<{ img: null | File; err: undefined | string }>({
    img: null,
    err: undefined
  });

  useEffect(() => {
    if (!defaultData) {
      dispatch({ type: '', payload: '' } as any);
      return;
    }

    dispatch({
      type: InputActionKind.subject,
      payload: defaultData.subject_name
    });

    dispatch({
      type: InputActionKind.examType,
      payload: defaultData.exam_type
    });

    dispatch({
      type: InputActionKind.visibility,
      payload: defaultData.visibility
    });
  }, [defaultData]);

  const handleInputFile = () => {
    if (!inputRef.current) return;
    inputRef.current.click();
  };

  const captureImage = () => {
    if (webcamRef.current == undefined) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      const file = dataURLtoFile(imageSrc, 'captured_image.jpg');
      setSelectedFile({ err: undefined, img: file });
      setIsWebcamOpen(false);
    }
  };

  const inputReducer = (state: inputStateType, action: InputAction) => {
    switch (action.type) {
      case InputActionKind.subject:
        return {
          ...state,
          subject: {
            value: action.payload as string,
            error: subjects.includes(action.payload as string) ? undefined : InputError.subject
          }
        };
      case InputActionKind.examType:
        return {
          ...state,
          examType: {
            value: action.payload as string,
            error: ExamTypeArr.includes(action.payload as string) ? undefined : InputError.examType
          }
        };
      case InputActionKind.visibility:
        return {
          ...state,
          visibility: { value: action.payload as boolean, error: undefined }
        };
    }
    return initialState;
  };

  const [input, dispatch] = useReducer(inputReducer, initialState);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFile({
        err: undefined,
        img: e.target.files[0].type.startsWith('image') ? e.target.files[0] : null
      });
    }
  };

  const convertImageToText = async () => {
    if (!selectedFile.img) return;
    setLoading({ ...loading, validatingImage: true });
    const res = await Tesseract.recognize(selectedFile.img, 'eng');
    setLoading({ ...loading, validatingImage: false });
    return res;
  };

  const handleSubmit = async () => {
    dispatch({ type: InputActionKind.examType, payload: input.examType.value });
    dispatch({ type: InputActionKind.subject, payload: input.subject.value });

    let errors = Object.entries(input)
      .map(([key, val]) => {
        return val.error;
      })
      .filter((err) => err != undefined).length;

    // if updating
    if (defaultData && errors == 0 && selectedFile.img == undefined) {
      setLoading({
        uploading: true,
        validatingImage: false
      });

      await updatePastPaper({
        file: null,
        visibility: input.visibility.value,
        examType: input.examType.value,
        subject_name: input.subject.value,
        uid: defaultData.uid
      });

      setLoading({
        uploading: false,
        validatingImage: false
      });

      onClose();
      return;
    }

    if (selectedFile.img == undefined) setSelectedFile({ img: null, err: InputError.image });

    errors = selectedFile.img == null ? errors + 1 : errors;

    if (errors != 0) {
      toast({
        status: 'error',
        description: `please resolve ${errors} errors to upload`,
        duration: 2000,
        position: 'top'
      });
      return;
    }

    const img_err = () => {
      toast({
        status: 'error',
        description: `Image not looks like exam paper`,
        duration: 3000,
        position: 'top'
      });
    };

    // TODO: validate image
    convertImageToText().then(async (res) => {
      if (!res?.data.lines.length) return img_err();
      if (res?.data.lines.length < 10) return img_err();

      const avgConfidence =
        res.data.lines.reduce((acc, curr) => {
          return acc + curr.confidence;
        }, 0) / res.data.lines.length;

      // all set
      toast({
        status: 'info',
        description: `The image appears to be legitimate, but out trusted member of the community will review it later.`,
        duration: 5000,
        position: 'top'
      });

      setLoading({ ...loading, uploading: false });

      toast({
        status: 'success',
        description: `Image has been uploaded ✔`,
        duration: 1000,
        position: 'top'
      });

      // lets rest everything
      setLoading((prev) => ({
        ...prev,
        uploading: true
      }));

      if (defaultData) {
        await updatePastPaper({
          file: selectedFile.img,
          visibility: input.visibility.value,
          examType: input.examType.value,
          subject_name: input.subject.value,
          uid: defaultData.uid,
          confidence: avgConfidence
        });
      } else {
        // update
        await upload({
          file: selectedFile.img,
          confidence: avgConfidence,
          currUser: user!,
          visibility: input.visibility.value,
          examType: input.examType.value,
          subject_name: input.subject.value
        });
      }

      // reset everything

      setSelectedFile({
        err: '',
        img: null
      });

      dispatch({
        type: '',
        payload: ''
      } as any);

      setLoading({
        uploading: false,
        validatingImage: false
      });

      toast({
        status: 'success',
        description: `Your past paper has been uploaded ✔`,
        duration: 1000,
        position: 'top'
      });

      onClose();
    });
  };

  const [isSmScreen] = useMediaQuery('(max-width: 500px)');

  return (
    <>
      <Drawer onClose={onClose} isOpen={isOpen} size={'full'}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>
            {defaultData ? `Past Papers Edit Form` : `Past Papers Upload Form`}
          </DrawerHeader>
          <DrawerBody>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}>
              <Flex p={isSmScreen ? '0rem' : '1rem'}>
                <Flex w="100%" flexDir={'column'}>
                  <VisuallyHidden>
                    <Input
                      type="file"
                      ref={inputRef}
                      accept="image/*"
                      onChange={handleFileInputChange}
                      capture
                    />
                  </VisuallyHidden>
                  <Center my={'1rem'}>
                    {selectedFile.img && (
                      <Flex flexDir={'column'} gap={'1rem'}>
                        <Image
                          src={URL.createObjectURL(selectedFile.img)}
                          alt="image"
                          width={350}
                          height={300}
                          quality={100}></Image>
                        <Center>
                          {!loading.validatingImage && !loading.uploading && (
                            <Button
                              colorScheme="red"
                              onClick={(e) =>
                                setSelectedFile({
                                  img: null,
                                  err: InputError.image
                                })
                              }>
                              Delete Image
                            </Button>
                          )}
                        </Center>
                      </Flex>
                    )}
                  </Center>
                  {defaultData && <></>}
                  {!selectedFile.img && (
                    <HStack>
                      <Box
                        bg={'var(--card-color)'}
                        py={'4rem'}
                        w={'100%'}
                        border={'3px dashed var(--border-color)'}
                        textAlign={'center'}
                        rounded={'lg'}
                        cursor={'pointer'}
                        onClick={handleInputFile}
                        style={{ display: selectedFile.img ? 'none' : 'initial' }}>
                        <Center flexDir={'column'} gap={3}>
                          <FaImages fontSize={'32'} />
                          <Text fontSize={isSmScreen ? 'sm' : 'xl'}>CLICK TO UPLOAD IMAGE</Text>
                        </Center>
                      </Box>
                      <Text fontWeight={'bold'}>OR</Text>
                      <Box
                        bg={'var(--card-color)'}
                        py={'4rem'}
                        w={'100%'}
                        border={'3px dashed var(--border-color)'}
                        textAlign={'center'}
                        rounded={'lg'}
                        cursor={'pointer'}
                        onClick={() => {
                          setIsWebcamOpen(true);
                        }}
                        style={{ display: selectedFile.img ? 'none' : 'initial' }}>
                        <Center flexDir={'column'} gap={3}>
                          <FaCamera fontSize={'32'} />
                          <Text fontSize={isSmScreen ? 'sm' : 'xl'}>UPLOAD IMAGE FROM CAMERA</Text>
                        </Center>
                      </Box>
                    </HStack>
                  )}

                  <Modal
                    isOpen={isWebcamOpen}
                    onClose={() => {
                      setIsWebcamOpen(false);
                    }}
                    size={'xl'}
                    isCentered>
                    <ModalOverlay />
                    <ModalContent margin={4}>
                      <Stack my={'1rem'}>
                        <Webcam
                          audio={false}
                          ref={webcamRef}
                          screenshotFormat="image/jpeg"
                          style={{ width: '100%' }}
                        />
                        <Button colorScheme="teal" onClick={captureImage}>
                          Capture
                        </Button>
                      </Stack>
                    </ModalContent>
                  </Modal>

                  <Center my={'1rem'} color={'red.300'}>
                    {selectedFile.err}
                  </Center>

                  <Flex flexWrap={'wrap'} gap="1rem" justifyContent={'center'} p={'1rem'}>
                    <AutoCompleteSearch
                      value={input.subject.value}
                      error={input.subject.error}
                      onSelectOption={(option) => {
                        dispatch({
                          type: InputActionKind.subject,
                          payload: option.item.value || ''
                        });
                      }}
                      options={subjects}
                      title={'Subject Name'}
                      placeholder={'Enter Subject Name'}
                      helperText={defaultData ? defaultData.subject_name : ''}
                    />

                    <AutoCompleteSearch
                      value={input.examType.value}
                      error={input.examType.error}
                      onSelectOption={(option) => {
                        dispatch({
                          type: InputActionKind.examType,
                          payload: option.item.value
                        });
                      }}
                      options={ExamTypeArr}
                      title={'Exam Type'}
                      helperText={defaultData ? defaultData.exam_type : ''}
                      placeholder={'Enter Exam Type Name'}
                    />

                    <SwitchForm
                      value={input.visibility.value == true ? 1 : 0}
                      onChange={(e) => {
                        dispatch({
                          type: InputActionKind.visibility,
                          payload: e.target.value == '1' ? !true : !false
                        });
                      }}
                      title="Visibility"
                      helperText="Optional, set to false if you want to hide your profile avatar"
                    />
                  </Flex>
                </Flex>
              </Flex>

              {loading.validatingImage && <Loader>Please Wait Validating Image Using AI</Loader>}
              {loading.uploading && <Loader>Uploading Image to Cloud</Loader>}
              <Center pt={'0.4rem'} mb={'3rem'}>
                {defaultData ? (
                  <Button
                    colorScheme="purple"
                    type="submit"
                    isLoading={loading.validatingImage || loading.uploading}>
                    Update
                  </Button>
                ) : (
                  <Button
                    colorScheme="whatsapp"
                    type="submit"
                    isLoading={loading.validatingImage || loading.uploading}>
                    Submit
                  </Button>
                )}
              </Center>
            </form>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};

const AutoCompleteSearch = ({
  title,
  options,
  placeholder,
  value,
  onSelectOption,
  error,
  helperText
}: {
  title: string;
  placeholder: string;
  options: Array<string>;
  value: string;
  onSelectOption:
    | ((params: {
        item: Item;
        selectMethod: 'mouse' | 'keyboard' | null;
        isNewInput?: boolean | undefined;
      }) => boolean | void)
    | undefined;
  error: string | undefined;
  helperText: string;
}) => {
  return (
    <>
      <FormControl w="60">
        <FormLabel>{title}</FormLabel>
        <AutoComplete openOnFocus value={value} onSelectOption={onSelectOption}>
          <AutoCompleteInput
            variant="filled"
            background={'var(--card-color)'}
            _hover={{ background: 'var(--card-color)' }}
            placeholder={placeholder}
            // value={value}
          />
          <AutoCompleteList background={'var(--bg-color)'}>
            {options.map((opt, cid) => (
              <AutoCompleteItem
                key={`option-${cid}`}
                value={opt}
                textTransform="capitalize"
                _hover={{ background: 'var(--card-color)' }}>
                {opt}
              </AutoCompleteItem>
            ))}
          </AutoCompleteList>
        </AutoComplete>
        {helperText && <FormHelperText>Prev: {helperText}</FormHelperText>}
        {error && (
          <Text color={'red.300'} fontSize={'sm'} className="roboto" my={'0.5rem'}>
            {error}
          </Text>
        )}
      </FormControl>
    </>
  );
};

const SwitchForm = ({
  title,
  helperText,
  value,
  onChange
}: {
  title: string;
  helperText: string;
  value: number;
  onChange: ((event: React.ChangeEvent<HTMLInputElement>) => void) | undefined;
}) => {
  return (
    <>
      <FormControl w="60">
        <FormLabel>{title}</FormLabel>
        <Switch
          size={'lg'}
          colorScheme={'purple'}
          value={value}
          onChange={onChange}
          isChecked={value == 1 ? true : false}
        />
        <FormHelperText>{helperText}</FormHelperText>
      </FormControl>
    </>
  );
};

export default UploadModal;

enum InputActionKind {
  subject = 'subject',
  examType = 'examType',
  visibility = 'visibility'
}

enum InputError {
  image = 'Paper Image Required',
  subject = 'Invalid Subject Name',
  examType = 'Invalid Option'
}

const ExamTypeArr = ['mid', 'final'];

interface InputAction {
  type: InputActionKind;
  payload: string | boolean;
}

interface inputStateType {
  subject: { value: string; error: undefined | string };
  examType: { value: string; error: undefined | string };
  visibility: { value: boolean; error: undefined | string };
}

const initialState: inputStateType = {
  subject: { value: '', error: undefined },
  examType: { value: '', error: undefined },
  visibility: { value: true, error: undefined }
};
