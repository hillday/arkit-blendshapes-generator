import './App.css';

import { useEffect, useState } from 'react';
import { FaceLandmarker, FaceLandmarkerOptions, FilesetResolver } from "@mediapipe/tasks-vision";
import { Color, Euler, Matrix4 } from 'three';
import { Canvas, useFrame, useGraph } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useDropzone } from 'react-dropzone';

let video: HTMLVideoElement;
let faceLandmarker: FaceLandmarker;
let lastVideoTime = -1;
let blendshapes: any[] = [];
let rotation: Euler;
let headMesh: any[] = [];
let isRecording = false;
let recordedArkitBlendshapes: { [key: string]: any } = {};
let startRecordingTime = -1;
let endRecordingTime = -1;


const options: FaceLandmarkerOptions = {
  baseOptions: {
    modelAssetPath: `./face_landmarker.task`,
    delegate: "GPU"
  },
  numFaces: 1,
  runningMode: "VIDEO",
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
};

function Avatar({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { nodes } = useGraph(scene);

  useEffect(() => {
    if (nodes.Wolf3D_Head) headMesh.push(nodes.Wolf3D_Head);
    if (nodes.Wolf3D_Teeth) headMesh.push(nodes.Wolf3D_Teeth);
    if (nodes.Wolf3D_Beard) headMesh.push(nodes.Wolf3D_Beard);
    if (nodes.Wolf3D_Avatar) headMesh.push(nodes.Wolf3D_Avatar);
    if (nodes.Wolf3D_Head_Custom) headMesh.push(nodes.Wolf3D_Head_Custom);
  }, [nodes, url]);

  useFrame(() => {
    if (blendshapes.length > 0) {
      blendshapes.forEach(element => {
        headMesh.forEach(mesh => {
          let index = mesh.morphTargetDictionary[element.categoryName];
          if (index >= 0) {
            mesh.morphTargetInfluences[index] = element.score;
          }
        });
      });

      nodes.Head.rotation.set(rotation.x, rotation.y, rotation.z);
      nodes.Neck.rotation.set(rotation.x / 5 + 0.3, rotation.y / 5, rotation.z / 5);
      nodes.Spine2.rotation.set(rotation.x / 10, rotation.y / 10, rotation.z / 10);
    }
  });

  return <primitive object={scene} position={[0, -1.75, 3]} />
}

function App() {
  const [url, setUrl] = useState<string>("./Asian_business_woman_ARKit.glb");
  const { getRootProps } = useDropzone({
    onDrop: files => {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setUrl(reader.result as string);
      }
      reader.readAsDataURL(file);
    }
  });

  const setup = async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks("./wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, options);

    video = document.getElementById("video") as HTMLVideoElement;
    navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false,
    }).then(function (stream) {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predict);
    });
  }

  const predict = async () => {
    let nowInMs = Date.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      const faceLandmarkerResult = faceLandmarker.detectForVideo(video, nowInMs);

      if (faceLandmarkerResult.faceBlendshapes && faceLandmarkerResult.faceBlendshapes.length > 0 && faceLandmarkerResult.faceBlendshapes[0].categories) {
        blendshapes = faceLandmarkerResult.faceBlendshapes[0].categories;

        const matrix = new Matrix4().fromArray(faceLandmarkerResult.facialTransformationMatrixes![0].data);
        rotation = new Euler().setFromRotationMatrix(matrix);
        if (isRecording) {
          if (startRecordingTime === -1) {
            let _nowTimestamp = new Date().getTime();
            startRecordingTime = _nowTimestamp;
            recordedArkitBlendshapes["startTime"] = startRecordingTime;
          }

          blendshapes.forEach(element => {
            if (element.categoryName in recordedArkitBlendshapes["blendshapes"]) {
              recordedArkitBlendshapes["blendshapes"][element.categoryName].push(element.score);
            } else {
              recordedArkitBlendshapes["blendshapes"][element.categoryName] = [element.score];
            }
          });

          recordedArkitBlendshapes["rotations"].push({ x: rotation.x, y: rotation.y, z: rotation.z, order: "XYZ" });

        } else if (!isRecording && startRecordingTime !== -1) {
          let _nowTimestamp = new Date().getTime();
          endRecordingTime = _nowTimestamp;
          recordedArkitBlendshapes["endTime"] = endRecordingTime;
          startRecordingTime = -1;
        }


      }
    }

    window.requestAnimationFrame(predict);
  }

  const handleRecordButtonClick = () => {
    isRecording = !isRecording;
    // blendshapes = [];
    if (isRecording) {
      recordedArkitBlendshapes["startTime"] = -1;
      recordedArkitBlendshapes["endTime"] = -1;
      recordedArkitBlendshapes["blendshapes"] = {};
      recordedArkitBlendshapes["rotations"] = [];
    }

    if (!isRecording && recordedArkitBlendshapes["startTime"] !== -1) {
      const button = document.getElementById("download-button") as HTMLButtonElement;
      button.style.display = "inline-block";

    }

    const button = document.getElementById("record-button") as HTMLButtonElement;
    button.innerText = isRecording ? "Recording" : "Start";
  }

  const handleDownloadButtonClick = () => {
    const blendshapesData = JSON.stringify(recordedArkitBlendshapes);

    const blob = new Blob([blendshapesData], { type: 'application/json' });

    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    let _nowTimestamp = new Date().getTime();
    downloadLink.download = 'arkit-blendshapes-' + _nowTimestamp + '.json';

    downloadLink.click();
  }


  useEffect(() => {
    setup();
  }, []);

  return (
    <div className="App">
      <div className="controls">
        <button id="record-button" className="record-button" onClick={handleRecordButtonClick}>
          {isRecording ? "Recording" : "Start"}
        </button>

        <button id="download-button" className="download-button" onClick={handleDownloadButtonClick}>
          Download
        </button>
      </div>

      <video className='camera-feed' id="video" autoPlay></video>
      <Canvas style={{ height: 600 }} camera={{ fov: 25 }} shadows>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} color={new Color(1, 1, 0)} intensity={0.5} castShadow />
        <pointLight position={[-10, 0, 10]} color={new Color(1, 0, 0)} intensity={0.5} castShadow />
        <pointLight position={[0, 0, 10]} intensity={0.5} castShadow />
        <Avatar url={url} />
      </Canvas>
      <img className='logo' src="./logo.png" />
    </div>
  );
}

export default App;
